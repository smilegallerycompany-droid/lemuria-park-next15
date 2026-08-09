import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { assertLocationAccess } from "@/server/auth/location-access";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";
import { revalidatePublicCms } from "@/server/cms/revalidate";
import { getMediaStorage } from "@/server/media/storage";

const patchSchema = z.object({
  locationId: z.string().nullable().optional(),
  altText: z.string().min(1).optional(),
  caption: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isPublished: z.boolean().optional(),
  archive: z.boolean().optional(),
  restore: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { id } = await context.params;
    const before = await prisma.galleryItem.findUnique({ where: { id } });
    if (!before) throw new ApiError("NOT_FOUND", "Gallery item не найден", 404);
    assertLocationAccess(actor, before.locationId);

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = patchSchema.parse(json);
    if (input.locationId !== undefined) assertLocationAccess(actor, input.locationId);

    let isPublished = input.isPublished;
    if (input.archive) isPublished = false;
    if (input.restore) isPublished = true;

    const meta = requestMeta(req);
    const item = await prisma.galleryItem.update({
      where: { id },
      data: {
        locationId: input.locationId === undefined ? undefined : input.locationId,
        altText: input.altText,
        caption: input.caption,
        sortOrder: input.sortOrder,
        ...(isPublished !== undefined ? { isPublished } : {}),
      },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: input.archive
        ? "GALLERY_ARCHIVE"
        : input.restore
          ? "GALLERY_RESTORE"
          : "GALLERY_UPDATE",
      entityType: "GalleryItem",
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
    const before = await prisma.galleryItem.findUnique({
      where: { id },
      include: { mediaObject: true },
    });
    if (!before) throw new ApiError("NOT_FOUND", "Gallery item не найден", 404);
    assertLocationAccess(actor, before.locationId);
    const meta = requestMeta(req);

    // Soft-archive by default; hard-remove media only when explicitly requested.
    const url = new URL(req.url);
    const hard = url.searchParams.get("hard") === "1";

    if (hard) {
      await prisma.galleryItem.delete({ where: { id } });
      if (before.mediaObject) {
        const { canPhysicallyDeleteMedia } = await import("@/server/media/storage");
        const canDelete = await canPhysicallyDeleteMedia(before.mediaObject.id, (id) =>
          prisma.galleryItem.count({ where: { mediaObjectId: id } }),
        );
        if (canDelete) {
          const storage = getMediaStorage();
          await storage.delete(before.mediaObject.key).catch(() => undefined);
          await prisma.mediaObject.delete({ where: { id: before.mediaObject.id } }).catch(() => undefined);
        }
      }
      await recordAuditLog(prisma, {
        actorId: actor.id,
        action: "GALLERY_REMOVE",
        entityType: "GalleryItem",
        entityId: id,
        before: { id: before.id, imageUrl: before.imageUrl },
        ...meta,
      });
    } else {
      const item = await prisma.galleryItem.update({
        where: { id },
        data: { isPublished: false },
      });
      await recordAuditLog(prisma, {
        actorId: actor.id,
        action: "GALLERY_ARCHIVE",
        entityType: "GalleryItem",
        entityId: id,
        before,
        after: item,
        ...meta,
      });
    }

    revalidatePublicCms();
    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
