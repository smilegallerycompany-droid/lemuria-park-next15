import { z } from "zod";
import { DOMAIN_CONFIG } from "@/server/domain/config";

export const reservationItemInputSchema = z
  .object({
    ticketTypeCode: z.string().trim().min(1, "ticketTypeCode обязателен"),
    quantity: z.number().int().min(0).max(DOMAIN_CONFIG.maxQuantityPerLineItem),
  })
  .strict();

/**
 * Deliberately accepts *only* what the customer chose. Price, subtotal,
 * total, remainingSeats, startsAt, ticket names, status and expiresAt are
 * always server-computed — `.strict()` rejects any of those if a client
 * tries to send them.
 */
export const createReservationInputSchema = z
  .object({
    /** The public `id` of a session, as returned by GET /api/public/sessions. */
    sessionPublicId: z.string().trim().min(1, "sessionPublicId обязателен"),
    items: z
      .array(reservationItemInputSchema)
      .min(1, "Нужно указать хотя бы один тип билета")
      .max(DOMAIN_CONFIG.maxReservationLineItems),
  })
  .strict()
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

export const reservationPublicIdParamSchema = z.object({
  publicId: z.string().trim().min(1),
});
