import { z } from "zod";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

export const analyticsQuerySchema = z.object({
  locationId: optionalId,
  from: optionalId,
  to: optionalId,
  source: z.enum(["ALL", "ONLINE", "CASHIER"]).default("ALL"),
  paymentMethod: z.enum(["ALL", "CASH", "CARD", "YOOKASSA"]).default("ALL"),
  ticketTypeId: optionalId,
  cashierId: optionalId,
  timezone: z.string().min(1).max(64).default("Europe/Moscow"),
  preset: z
    .enum([
      "today",
      "yesterday",
      "last_7",
      "last_30",
      "this_month",
      "prev_month",
      "custom",
    ])
    .optional(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
