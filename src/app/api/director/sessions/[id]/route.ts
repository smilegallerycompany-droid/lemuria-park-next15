import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";
import { DomainError } from "@/server/domain/errors";
import { assertSessionStatusTransition } from "@/server/domain/session-status";
import { assertLocationAccess } from "@/server/auth/location-access";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["SCHEDULED", "OPEN", "CLOSED", "CANCELLED", "COMPLETED"]),
});

async function assertNoPaidOrders(sessionId: string): Promise<void> {
  const paidCount = await prisma.order.count({
    where: { sessionId, status: "PAID" },
  });
  if (paidCount > 0) {
    throw new DomainError(
      "SESSION_HAS_PAID_ORDERS",
      "Нельзя отменить или удалить сеанс с оплаченными заказами",
      { paidCount },
    );
  }
}

/**
 * Update session status. Closing an empty session is allowed.
 * Cancelling a session that has PAID orders is refused.
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { id } = await context.params;
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = patchSchema.parse(json);
    const meta = requestMeta(req);

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new ApiError("NOT_FOUND", "Сеанс не найден", 404);
    }
    assertLocationAccess(actor, session.locationId);
    assertSessionStatusTransition(session.status, input.status);

    if (input.status === "CANCELLED" || input.status === "CLOSED") {
      // Closing/cancelling with PAID orders is refused (empty sessions OK).
      if (input.status === "CANCELLED") {
        await assertNoPaidOrders(session.id);
      } else {
        // CLOSED: allow only when no PAID orders (empty or unpaid holds only).
        await assertNoPaidOrders(session.id);
      }
    }

    const updated = await prisma.session.update({
      where: { id: session.id },
      data: { status: input.status },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "SESSION_STATUS_UPDATE",
      entityType: "Session",
      entityId: session.id,
      before: { status: session.status },
      after: { status: updated.status },
      ...meta,
    });

    return apiSuccess({ session: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Delete a session that has no PAID orders. Refuses otherwise.
 */
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { id } = await context.params;
    const meta = requestMeta(req);

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new ApiError("NOT_FOUND", "Сеанс не найден", 404);
    }
    assertLocationAccess(actor, session.locationId);
    assertSessionStatusTransition(session.status, "CANCELLED");

    await assertNoPaidOrders(session.id);

    // Soft-cancel rather than hard-delete when any related rows exist.
    const related = await prisma.order.count({ where: { sessionId: session.id } });
    if (related > 0) {
      const updated = await prisma.session.update({
        where: { id: session.id },
        data: { status: "CANCELLED" },
      });
      await recordAuditLog(prisma, {
        actorId: actor.id,
        action: "SESSION_CANCELLED",
        entityType: "Session",
        entityId: session.id,
        after: { status: updated.status },
        ...meta,
      });
      return apiSuccess({ session: updated, deleted: false });
    }

    await prisma.session.delete({ where: { id: session.id } });
    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "SESSION_DELETED",
      entityType: "Session",
      entityId: session.id,
      before: { startsAt: session.startsAt.toISOString(), status: session.status },
      ...meta,
    });

    return apiSuccess({ deleted: true, id: session.id });
  } catch (error) {
    return handleApiError(error);
  }
}
