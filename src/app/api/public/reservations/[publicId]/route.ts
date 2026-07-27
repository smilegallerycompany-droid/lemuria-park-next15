import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { reservationPublicIdParamSchema } from "@/lib/validation/reservation";
import { getReservationByPublicId } from "@/server/services/reservations";
import { toReservationDto } from "@/server/mappers/reservation";

interface RouteParams {
  params: Promise<{ publicId: string }>;
}

/**
 * Looks up a reservation by its public-safe id — never the internal
 * database id. A reservation whose hold has expired is lazily flipped to
 * EXPIRED and returned with that explicit status (HTTP 200), rather than a
 * 410 — one consistent way for the client to detect expiry either way.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { publicId } = reservationPublicIdParamSchema.parse(await params);
    const reservation = await getReservationByPublicId(publicId);
    if (!reservation) {
      return apiError("RESERVATION_NOT_FOUND", "Резервирование не найдено", 404);
    }
    const response = await toReservationDto(reservation);
    return apiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
}
