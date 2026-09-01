import { FAQ_PUBLIC_LIMIT } from "@/lib/cms/defaults";
import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";
import { revalidatePublicCms } from "@/server/cms/revalidate";

const createSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isPublished: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireDirector();
    const faq = await prisma.faqItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return apiSuccess({ faq });
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
    if (input.isPublished) {
      const published = await prisma.faqItem.count({ where: { isPublished: true } });
      if (published >= FAQ_PUBLIC_LIMIT) {
        throw new ApiError(
          "FORBIDDEN",
          `На главной максимум ${FAQ_PUBLIC_LIMIT} вопросов FAQ`,
          409,
        );
      }
    }
    const meta = requestMeta(req);

    const item = await prisma.faqItem.create({ data: input });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "FAQ_CREATE",
      entityType: "FaqItem",
      entityId: item.id,
      after: item,
      ...meta,
    });

    revalidatePublicCms();
    return apiSuccess({ item });
  } catch (error) {
    return handleApiError(error);
  }
}
