import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { createOrderInputSchema } from "@/lib/validation/order";
import { createOrder } from "@/server/services/orders";
import { toOrderDto } from "@/server/mappers/order";

/**
 * Creates an Order from an existing Reservation. The client sends only
 * `reservationPublicId` + contact details — never a price, amount, status,
 * line items or `expiresAt`. Everything financial is derived server-side
 * from the reservation's own (already server-priced) line items. A
 * reservation that has already expired is rejected; one that already has
 * an order idempotently returns that same order.
 *
 * Idempotency: pass an `Idempotency-Key` header to make retries safe. A
 * repeated key with the same payload returns the original order; a
 * repeated key with a different payload is rejected (IDEMPOTENCY_CONFLICT).
 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON в теле запроса", 400);
    });
    const input = createOrderInputSchema.parse(json);
    const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;
    const order = await createOrder(input, idempotencyKey);
    const response = await toOrderDto(order);
    return apiSuccess(response, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
