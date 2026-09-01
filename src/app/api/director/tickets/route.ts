import { apiSuccess, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { constrainLocationIds } from "@/server/auth/location-access";
import { parseIsoDateParam } from "@/server/director/http";

export async function GET(req: Request) {
  try {
    const actor = await requireDirector();
    const url = new URL(req.url);
    const locationId = url.searchParams.get("locationId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const search = url.searchParams.get("search")?.trim();
    const from = url.searchParams.get("from")
      ? parseIsoDateParam(url.searchParams.get("from"), new Date(0))
      : undefined;
    const to = url.searchParams.get("to")
      ? parseIsoDateParam(url.searchParams.get("to"), new Date())
      : undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const scoped = constrainLocationIds(actor, locationId);

    const tickets = await prisma.ticket.findMany({
      where: {
        ...(scoped ? { session: { locationId: { in: scoped } } } : {}),
        ...(status ? { status: status as never } : {}),
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
                { publicId: { contains: search, mode: "insensitive" } },
                { order: { number: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        ticketType: { select: { name: true, code: true } },
        session: {
          select: {
            startsAt: true,
            location: { select: { id: true, name: true } },
          },
        },
        order: { select: { number: true, status: true, source: true } },
      },
    });

    return apiSuccess({
      tickets: tickets.map((ticket) => {
        const rest = { ...ticket };
        delete (rest as { qrToken?: string }).qrToken;
        return {
          ...rest,
          holderLabel: null as string | null,
          location: ticket.session.location,
        };
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
