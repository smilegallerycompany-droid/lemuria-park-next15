import { apiSuccess, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { parseIsoDateParam } from "@/server/director/http";

export async function GET(req: Request) {
  try {
    await requireDirector();
    const url = new URL(req.url);
    const locationId = url.searchParams.get("locationId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const source = url.searchParams.get("source") ?? undefined;
    const search = url.searchParams.get("search")?.trim();
    const from = url.searchParams.get("from")
      ? parseIsoDateParam(url.searchParams.get("from"), new Date(0))
      : undefined;
    const to = url.searchParams.get("to")
      ? parseIsoDateParam(url.searchParams.get("to"), new Date())
      : undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

    const orders = await prisma.order.findMany({
      where: {
        ...(locationId
          ? {
              OR: [{ locationId }, { session: { locationId } }],
            }
          : {}),
        ...(status ? { status: status as never } : {}),
        ...(source ? { source: source as never } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { number: { contains: search, mode: "insensitive" } },
                { customerName: { contains: search, mode: "insensitive" } },
                { customerPhone: { contains: search } },
                { customerEmail: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        location: { select: { id: true, name: true } },
        session: { select: { startsAt: true, endsAt: true } },
        _count: { select: { tickets: true, items: true } },
      },
    });

    return apiSuccess({ orders });
  } catch (error) {
    return handleApiError(error);
  }
}
