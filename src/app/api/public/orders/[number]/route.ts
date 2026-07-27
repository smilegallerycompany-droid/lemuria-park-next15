import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { orderNumberParamSchema } from "@/lib/validation/order";
import { getOrderByNumber } from "@/server/services/orders";
import { toOrderDto } from "@/server/mappers/order";

interface RouteParams {
  params: Promise<{ number: string }>;
}

/** Looks up an order by its public-safe, non-guessable `number`. */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { number } = orderNumberParamSchema.parse(await params);
    const order = await getOrderByNumber(number);
    if (!order) {
      return apiError("ORDER_NOT_FOUND", "Заказ не найден", 404);
    }
    const response = await toOrderDto(order);
    return apiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
}
