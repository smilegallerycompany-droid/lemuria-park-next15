import { z } from "zod";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { normalizePhone } from "@/lib/phone";

export const cashierLoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(6).max(128),
  })
  .strict();

export const cashierSaleItemSchema = z
  .object({
    ticketTypeCode: z.string().trim().min(1),
    quantity: z.number().int().min(0).max(DOMAIN_CONFIG.maxQuantityPerLineItem),
  })
  .strict();

export const cashierSaleSchema = z
  .object({
    sessionPublicId: z.string().trim().min(1),
    items: z.array(cashierSaleItemSchema).min(1).max(DOMAIN_CONFIG.maxReservationLineItems),
    /** CASH / CARD_TERMINAL / CARD_ONLINE («Сайт» — онлайн-оплата, без смены Order.source). */
    paymentMethod: z.enum(["CASH", "CARD_TERMINAL", "CARD_ONLINE"]),
    customerName: z.string().trim().min(2).max(120).optional().default("Гость кассы"),
    customerPhone: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((value) => (value ? normalizePhone(value) : "+70000000000")),
    customerEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .optional()
      .default("cashier-guest@lemuriapark.local"),
  })
  .strict()
  .refine((value) => value.items.some((item) => item.quantity > 0), {
    message: "Нужно выбрать хотя бы один билет",
    path: ["items"],
  });

export type CashierSaleInput = z.infer<typeof cashierSaleSchema>;

export const cashierOrdersQuerySchema = z.object({
  filter: z.enum(["today", "all", "paid", "cancelled"]).default("today"),
  search: z.string().trim().max(64).optional(),
});

export type CashierOrdersQuery = z.infer<typeof cashierOrdersQuerySchema>;
