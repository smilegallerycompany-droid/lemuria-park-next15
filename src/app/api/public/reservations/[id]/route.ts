import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { reservationIdParamSchema } from "@/lib/validation/reservation";
import { getReservationByPublicId } from "@/server/services/reservations";
import { toReservationDto } from "@/server/mappers/reservation";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Looks up a reservation by its public-safe id (never the internal db id). */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { id } = reservationIdParamSchema.parse(await params);
    const reservation = await getReservationByPublicId(id);
    if (!reservation) {
      return apiError("NOT_FOUND", "Резервирование не найдено", 404);
    }
    const response = await toReservationDto(reservation);
    return apiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
}
