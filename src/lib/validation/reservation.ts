import { z } from "zod";

export const reservationItemInputSchema = z.object({
  ticketTypeCode: z.string().trim().min(1, "ticketTypeCode обязателен"),
  quantity: z.number().int().min(0).max(50),
});

export const createReservationInputSchema = z
  .object({
    /** The public `id` of a session, as returned by GET /api/public/sessions. */
    sessionId: z.string().trim().min(1, "sessionId обязателен"),
    items: z
      .array(reservationItemInputSchema)
      .min(1, "Нужно указать хотя бы один тип билета")
      .max(20),
    customerName: z.string().trim().min(2).max(120).optional(),
    customerPhone: z.string().trim().min(5).max(32).optional(),
    customerEmail: z.string().trim().email().optional(),
    /** Optional client-supplied idempotency key — safe to retry the same request. */
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .refine((value) => value.items.some((item) => item.quantity > 0), {
    message: "Суммарное количество билетов должно быть больше нуля",
    path: ["items"],
  });

export type CreateReservationInput = z.infer<typeof createReservationInputSchema>;

export const sessionsQuerySchema = z.object({
  locationSlug: z.string().trim().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date должен быть в формате YYYY-MM-DD")
    .optional(),
});

export type SessionsQuery = z.infer<typeof sessionsQuerySchema>;

export const reservationIdParamSchema = z.object({
  id: z.string().trim().min(1),
});
