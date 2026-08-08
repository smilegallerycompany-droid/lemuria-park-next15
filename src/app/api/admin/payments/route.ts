import { apiSuccess, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/server/auth/staff-session";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const locationId = url.searchParams.get("locationId");
    const provider = url.searchParams.get("provider");

    const payments = await prisma.payment.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(provider ? { provider } : {}),
        ...(locationId ? { order: { locationId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        status: true,
        provider: true,
        providerPaymentId: true,
        createdAt: true,
        updatedAt: true,
        order: {
          select: {
            number: true,
            location: { select: { id: true, name: true, city: true } },
          },
        },
      },
    });

    return apiSuccess({
      payments: payments.map((p) => ({
        ...p,
        // Never expose secrets — providerPaymentId is an id, not a credential.
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
