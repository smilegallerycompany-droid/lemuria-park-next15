import { z } from "zod";

export const createOrderInputSchema = z.object({
  /** The public `id` of a reservation, as returned by POST /api/public/reservations. */
  reservationId: z.string().trim().min(1, "reservationId обязателен"),
  customerName: z.string().trim().min(2, "Укажите имя").max(120, "Имя слишком длинное"),
  customerPhone: z.string().trim().min(5, "Укажите телефон").max(32, "Телефон слишком длинный"),
  customerEmail: z.string().trim().email("Некорректный email"),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

/** Subset used by the checkout contact form (react-hook-form + zodResolver on the client). */
export const checkoutContactFormSchema = createOrderInputSchema.omit({
  reservationId: true,
  idempotencyKey: true,
});

export type CheckoutContactFormValues = z.infer<typeof checkoutContactFormSchema>;

export const orderNumberParamSchema = z.object({
  number: z.string().trim().min(1),
});
