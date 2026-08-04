import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";

const createSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  minAge: z.number().int().nullable().optional(),
  maxAge: z.number().int().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireDirector();
    const ticketTypes = await prisma.ticketType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { priceRules: true, tickets: true } } },
    });
    return apiSuccess({
      ticketTypes: ticketTypes.map((tt) => ({
        ...tt,
        ageRule: null,
        isFree: false,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireDirector();
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = createSchema.parse(json);
    const meta = requestMeta(req);

    const ticketType = await prisma.ticketType.create({ data: input });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "TICKET_TYPE_CREATE",
      entityType: "TicketType",
      entityId: ticketType.id,
      after: ticketType,
      ...meta,
    });

    return apiSuccess({ ticketType: { ...ticketType, ageRule: null, isFree: false } }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
