import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

const customerNameSchema = z.string().trim().min(2, "Укажите имя").max(120, "Имя слишком длинное");

const customerPhoneSchema = z
  .string()
  .trim()
  .min(5, "Укажите телефон")
  .max(32, "Телефон слишком длинный")
  .transform(normalizePhone)
  .refine((phone) => /^\+?\d{7,15}$/.test(phone), "Некорректный номер телефона");

const customerEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Некорректный email")
  .max(160, "Email слишком длинный");

/**
 * Deliberately accepts *only* customer contact data — no items, prices or
 * totals. `.strict()` rejects unknown fields outright.
 */
export const createOrderInputSchema = z
  .object({
    /** The public `id` of a reservation, as returned by POST /api/public/reservations. */
    reservationPublicId: z.string().trim().min(1, "reservationPublicId обязателен"),
    customerName: customerNameSchema,
    customerPhone: customerPhoneSchema,
    customerEmail: customerEmailSchema,
  })
  .strict();

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

/** Subset used by the checkout contact form (react-hook-form + zodResolver on the client). */
export const checkoutContactFormSchema = z.object({
  customerName: customerNameSchema,
  customerPhone: customerPhoneSchema,
  customerEmail: customerEmailSchema,
});

export type CheckoutContactFormValues = z.infer<typeof checkoutContactFormSchema>;

export const orderNumberParamSchema = z.object({
  number: z.string().trim().min(1),
});
