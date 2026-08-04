import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";

const createSchema = z.object({
  locationId: z.string().min(1),
  ticketTypeId: z.string().min(1),
  dayType: z.enum(["WEEKDAY", "WEEKEND"]),
  priceAmount: z.number().int().min(0),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
});

export async function GET(req: Request) {
  try {
    await requireDirector();
    const locationId = new URL(req.url).searchParams.get("locationId") ?? undefined;
    const prices = await prisma.priceRule.findMany({
      where: locationId ? { locationId } : undefined,
      orderBy: [{ locationId: "asc" }, { ticketTypeId: "asc" }, { dayType: "asc" }],
      include: {
        location: { select: { id: true, name: true } },
        ticketType: { select: { id: true, code: true, name: true } },
      },
    });
    return apiSuccess({ prices });
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

    const price = await prisma.priceRule.create({
      data: {
        locationId: input.locationId,
        ticketTypeId: input.ticketTypeId,
        dayType: input.dayType,
        priceAmount: input.priceAmount,
        validFrom: input.validFrom ? new Date(input.validFrom) : new Date(),
        validTo: input.validTo ? new Date(input.validTo) : null,
        isActive: input.isActive,
      },
      include: {
        location: { select: { name: true } },
        ticketType: { select: { code: true, name: true } },
      },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "PRICE_CREATE",
      entityType: "PriceRule",
      entityId: price.id,
      after: price,
      ...meta,
    });

    return apiSuccess({ price }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
