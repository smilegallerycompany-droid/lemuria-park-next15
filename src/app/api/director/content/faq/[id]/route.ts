import { FAQ_PUBLIC_LIMIT } from "@/lib/cms/defaults";
import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";
import { revalidatePublicCms } from "@/server/cms/revalidate";

const patchSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isPublished: z.boolean().optional(),
  /** Soft-archive: sets isPublished=false */
  archive: z.boolean().optional(),
  restore: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { id } = await context.params;
    const before = await prisma.faqItem.findUnique({ where: { id } });
    if (!before) throw new ApiError("NOT_FOUND", "FAQ не найден", 404);

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = patchSchema.parse(json);
    const meta = requestMeta(req);

    let isPublished = input.isPublished;
    if (input.archive) isPublished = false;
    if (input.restore) isPublished = true;

    if (isPublished === true && !before.isPublished) {
      const published = await prisma.faqItem.count({ where: { isPublished: true } });
      if (published >= FAQ_PUBLIC_LIMIT) {
        throw new ApiError(
          "FORBIDDEN",
          `На главной максимум ${FAQ_PUBLIC_LIMIT} вопросов FAQ`,
          409,
        );
      }
    }

    const item = await prisma.faqItem.update({
      where: { id },
      data: {
        question: input.question,
        answer: input.answer,
        sortOrder: input.sortOrder,
        ...(isPublished !== undefined ? { isPublished } : {}),
      },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: input.archive
        ? "FAQ_ARCHIVE"
        : input.restore
          ? "FAQ_RESTORE"
          : "FAQ_UPDATE",
      entityType: "FaqItem",
      entityId: id,
      before,
      after: item,
      ...meta,
    });

    revalidatePublicCms();
    return apiSuccess({ item });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { id } = await context.params;
    const before = await prisma.faqItem.findUnique({ where: { id } });
    if (!before) throw new ApiError("NOT_FOUND", "FAQ не найден", 404);
    const meta = requestMeta(req);

    // Soft-delete / archive — keep row for audit restore.
    const item = await prisma.faqItem.update({
      where: { id },
      data: { isPublished: false },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "FAQ_ARCHIVE",
      entityType: "FaqItem",
      entityId: id,
      before,
      after: item,
      ...meta,
    });

    revalidatePublicCms();
    return apiSuccess({ item });
  } catch (error) {
    return handleApiError(error);
  }
}
