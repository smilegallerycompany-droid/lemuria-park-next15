import { z } from "zod";
import { ApiError } from "@/lib/api/response";

const money = z.number().int().min(0).max(2147483647);
const line = z.object({
  code: z.string().trim().min(1).max(128),
  quantity: z.number().int().min(1).max(999),
  amount: money.refine(value => value > 0),
}).strict().refine(value => value.amount % value.quantity === 0);
const receipt = z.object({
  version: z.literal(1),
  totalAmount: money.refine(value => value > 0),
  items: z.array(line).min(1).max(100),
}).strict().refine(value => value.items.reduce((sum, item) => sum + item.amount, 0) === value.totalAmount);

type PricedLine = { code: string; quantity: number; unitPriceAmount: number; subtotalAmount: number };

/** Adapter for the deployed quote shape: tickets use ticketTypeCode while
 * OrderExtra uses code. Bundle secondarySessionId stays in the order domain;
 * it must not multiply the bank charge or the fiscal line quantity.
 * ticketTypes must be the server's locked catalog rows, never client values.
 */
export function prepareQuotedEvotorReceipt(quote: {
  totalAmount: number;
  items: Array<Omit<PricedLine, "code"> & { ticketTypeCode: string; secondarySessionId?: string | null }>;
  extras?: PricedLine[];
}, ticketTypes: Array<{ code: string }>) {
  const codes = new Set(ticketTypes.map(type => type.code));
  if (codes.size !== ticketTypes.length) {
    throw new ApiError("CONFLICT", "Неоднозначный справочник позиций чека", 409);
  }
  return prepareEvotorReceipt({
    totalAmount: quote.totalAmount,
    items: quote.items.map(item => {
      const code = item.ticketTypeCode;
      if (!codes.has(code)) throw new ApiError("CONFLICT", "Не найден код позиции чека", 409);
      return { ...item, code };
    }),
    extras: quote.extras,
  });
}

/** Only call after server pricing, capacity, location and companion checks.
 * The production quote stores extras separately from ticket lines. Preserve
 * both in the fiscal snapshot without making extras into admission tickets.
 */
export function prepareEvotorReceipt(quote: {
  totalAmount: number; items: PricedLine[]; extras?: PricedLine[];
}) {
  const items = [...quote.items, ...(quote.extras ?? [])].map(item => {
    if (!Number.isSafeInteger(item.unitPriceAmount) || item.unitPriceAmount <= 0 ||
        item.subtotalAmount !== item.unitPriceAmount * item.quantity) {
      throw new ApiError("CONFLICT", "Цена позиции не соответствует составу чека", 409);
    }
    return { code: item.code, quantity: item.quantity, amount: item.subtotalAmount };
  });
  return readEvotorReceipt({ version: 1, totalAmount: quote.totalAmount, items }, quote.totalAmount);
}

/** A missing old snapshot is not reconstructed from today's mutable catalog. */
export function readEvotorReceipt(value: unknown, orderTotal: number) {
  const parsed = receipt.safeParse(value);
  if (!parsed.success || parsed.data.totalAmount !== orderTotal) {
    throw new ApiError("CONFLICT", "Сохранённый состав чека требует сверки", 409);
  }
  return parsed.data;
}
