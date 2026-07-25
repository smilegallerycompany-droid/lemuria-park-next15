import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { createReservationInputSchema } from "@/lib/validation/reservation";
import { createReservation } from "@/server/services/reservations";
import { toReservationDto } from "@/server/mappers/reservation";

/**
 * Creates a temporary seat hold for a session. Runs inside a Serializable
 * transaction (see `server/services/reservations.ts`) so concurrent
 * requests can never oversell the same session's capacity. Price and total
 * are always computed server-side — the client only sends ticket type
 * codes and quantities.
 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON в теле запроса", 400);
    });
    const input = createReservationInputSchema.parse(json);
    const reservation = await createReservation(input);
    const response = await toReservationDto(reservation);
    return apiSuccess(response, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
