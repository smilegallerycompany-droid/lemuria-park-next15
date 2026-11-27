"use strict";

async function handle(request, context) {
  let response;
  try {
    const user = await context.requireCashier();
    const number = new URL(request.url).searchParams.get("number");
    if (!number || number.length > 128) {
      throw new context.ApiError("VALIDATION_ERROR", "Укажите заказ", 400);
    }
    // Use the deployed role policy (only OWNER is global), not the older source policy.
    const locations = context.locationIdsForActor(user);
    const order = await context.prisma.order.findFirst({
      where: { number, cashierId: user.id, source: "CASHIER",
        ...(locations === null ? {} : { locationId: { in: locations } }) },
      select: { number: true, status: true, totalAmount: true,
        evotorCheckout: { select: { state: true, cashReceived: true, changeAmount: true } } },
    });
    if (!order) throw new context.ApiError("NOT_FOUND", "Заказ не найден", 404);
    response = Response.json({ok:true,data:order});
  } catch (error) {
    response = context.handleApiError(error);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
module.exports = { handle };
