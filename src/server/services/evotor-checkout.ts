import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/response";
import { recordSaleOnShift } from "@/server/services/cashier-shifts";
import { issueTicketsForOrder } from "@/server/services/tickets";
import { readEvotorReceipt } from "@/server/services/evotor-receipt";

const terminalSchema = z.array(z.object({
  id: z.string().min(1), locationId: z.string().min(1),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
}));
function terminals() {
  const rows = terminalSchema.parse(JSON.parse(process.env.EVOTOR_TERMINALS_JSON || "[]"));
  if (new Set(rows.map(t => t.id)).size !== rows.length || new Set(rows.map(t => t.tokenHash)).size !== rows.length) {
    throw new ApiError("NOT_CONFIGURED", "Неоднозначная конфигурация касс", 503);
  }
  return rows;
}
export function terminalForLocation(locationId: string) {
  const matches = terminals().filter(t => t.locationId === locationId);
  if (matches.length > 1) throw new ApiError("NOT_CONFIGURED", "Неоднозначная привязка кассы", 503);
  return matches[0] ?? null;
}
export function authenticateTerminal(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || token.length < 32 || token === "lemuria-evotor-staging-connectivity") {
    throw new ApiError("UNAUTHORIZED", "Требуется токен кассы", 401);
  }
  const hash = createHash("sha256").update(token).digest();
  const matches = terminals().filter(t => timingSafeEqual(hash, Buffer.from(t.tokenHash, "hex")));
  if (matches.length !== 1) throw new ApiError("UNAUTHORIZED", "Неизвестная касса", 401);
  return matches[0];
}
const resultSchema = z.object({
  requestId: z.string().min(1), outcome: z.enum(["FISCALIZED", "DECLINED", "UNKNOWN"]),
  amount: z.number().int().positive().optional(),
  paymentMethod: z.enum(["CASH", "CARD_TERMINAL"]).optional(),
  receipt: z.object({ serial: z.string().regex(/^\d{16}$/),
    documentNumber: z.string().regex(/^[1-9]\d{0,9}$/), fiscalSign: z.string().regex(/^\d{1,10}$/) }).optional(),
});
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim"), claimId: z.string().uuid() }),
  z.object({ action: z.literal("result"), result: resultSchema }),
]);
export async function handleTerminalRequest(terminal: { id: string; locationId: string }, raw: unknown) {
  const body = bodySchema.parse(raw);
  return prisma.$transaction(async tx => {
    // Serialize a terminal's claims and results across workers. A claimed job is
    // never reassigned on timeout because its fiscal outcome can be uncertain.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${terminal.id}, 0))::text`;
    if (body.action === "claim") {
      const include = { order: { include: { payments: true } } } as const;
      const previous = await tx.evotorCheckout.findFirst({ where: { terminalId: terminal.id, claimId: body.claimId }, include });
      // A terminal can be reassigned in configuration while a claim is pending.
      // Recovery must never send the old location's order to the new location.
      if (previous && previous.order.locationId !== terminal.locationId) {
        throw new ApiError("CONFLICT", "Касса перепривязана к другой локации: требуется сверка", 409);
      }
      if (previous && previous.state !== "CLAIMED") return { sale: null, completedClaim: true, unresolvedRequestId: null };
      const unresolved = await tx.evotorCheckout.findFirst({ where: { terminalId: terminal.id, state: "CLAIMED" } });
      if (unresolved && unresolved.claimId !== body.claimId) return { sale: null, unresolvedRequestId: unresolved.id };
      const job = previous ?? await tx.evotorCheckout.findFirst({
        where: { terminalId: terminal.id, state: "QUEUED", order: { locationId: terminal.locationId } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include,
      });
      if (!job) return { sale: null, unresolvedRequestId: null };
      if (job.order.status !== "AWAITING_PAYMENT" || job.order.source !== "CASHIER" ||
          job.order.payments.length !== 1 || job.order.payments[0].status !== "PENDING" ||
          !["CASH", "CARD_TERMINAL"].includes(job.order.payments[0].method)) {
        throw new ApiError("CONFLICT", "Некорректное состояние заказа кассы", 409);
      }
      const snapshot = readEvotorReceipt(job.receiptPayload, job.order.totalAmount);
      await tx.evotorCheckout.update({ where: { id: job.id }, data: { state: "CLAIMED", claimId: body.claimId } });
      return { unresolvedRequestId: null, sale: {
        id: job.id, totalAmount: job.order.totalAmount, paymentMethod: job.order.payments[0].method,
        cashReceived: job.cashReceived, changeAmount: job.changeAmount,
        items: snapshot.items,
      }};
    }
    const result = body.result;
    const job = await tx.evotorCheckout.findUnique({ where: { id: result.requestId },
      include: { order: { include: { payments: true, items: true } } } });
    if (!job || job.terminalId !== terminal.id || job.order.locationId !== terminal.locationId) {
      throw new ApiError("NOT_FOUND", "Операция не найдена", 404);
    }
    if (job.state === "FISCALIZED" || job.state === "DECLINED") {
      if (JSON.stringify(job.result) !== JSON.stringify(result)) {
        // JSONB key ordering is not stable. Compare normalized schema values.
        if (JSON.stringify(resultSchema.parse(job.result)) !== JSON.stringify(result))
          throw new ApiError("CONFLICT", "Результат операции уже сохранён", 409);
      }
      return { state: job.state };
    }
    if (result.outcome === "UNKNOWN") return { state: job.state };
    if (job.state !== "CLAIMED") throw new ApiError("CONFLICT", "Операция не выдана кассе", 409);
    const order = job.order;
    const payment = order.payments[0];
    if (order.status !== "AWAITING_PAYMENT" || order.source !== "CASHIER" ||
        order.payments.length !== 1 || payment.status !== "PENDING") {
      throw new ApiError("CONFLICT", "Заказ требует сверки", 409);
    }
    if (result.outcome === "FISCALIZED") {
      readEvotorReceipt(job.receiptPayload, order.totalAmount);
      if (!result.receipt || result.amount !== order.totalAmount || result.paymentMethod !== payment.method) {
        throw new ApiError("CONFLICT", "Чек не соответствует заказу", 409);
      }
      await tx.evotorCheckout.update({ where: { id: job.id }, data: {
        state: result.outcome, result, fiscalKey: `${result.receipt.serial}:${result.receipt.documentNumber}`,
      }});
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED", provider: "EVOTOR", providerPaymentId: `evotor:${result.receipt.serial}:${result.receipt.documentNumber}`, payload: result } });
      if (!order.shiftId || !order.cashierId) throw new ApiError("CONFLICT", "Не найдена смена заказа", 409);
      await recordSaleOnShift(tx, { shiftId: order.shiftId, orderId: order.id, userId: order.cashierId,
        paymentMethod: payment.method, amount: order.totalAmount,
        ticketsCount: order.items.reduce((sum, item) => sum + item.quantity, 0) });
      await issueTicketsForOrder(order.id, tx);
    } else {
      await tx.evotorCheckout.update({ where: { id: job.id }, data: { state: result.outcome, result } });
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    }
    await recordAuditLog(tx, { actorId: order.cashierId, action: "EVOTOR_CHECKOUT_RESULT",
      entityType: "Order", entityId: order.id,
      metadata: { terminalId: terminal.id, checkoutId: job.id, outcome: result.outcome } });
    return { state: result.outcome };
  });
}
