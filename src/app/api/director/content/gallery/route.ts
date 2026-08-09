import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { assertLocationAccess } from "@/server/auth/location-access";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";
import { revalidatePublicCms } from "@/server/cms/revalidate";
import { getMediaStorage } from "@/server/media/storage";
import { randomBytes } from "node:crypto";

const metaSchema = z.object({
  locationId: z.string().nullable().optional(),
  imageUrl: z.string().url().optional(),
  altText: z.string().min(1).optional(),
  caption: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isPublished: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    await requireDirector();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 24)));
    const skip = (page - 1) * pageSize;

    const [total, gallery] = await Promise.all([
      prisma.galleryItem.count(),
      prisma.galleryItem.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        skip,
        take: pageSize,
        include: {
          location: { select: { id: true, name: true } },
          mediaObject: true,
        },
      }),
    ]);

    return apiSuccess({ gallery, page, pageSize, total });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireDirector();
    const meta = requestMeta(req);
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const storage = getMediaStorage();
      if (storage.status() === "NOT_CONFIGURED") {
        throw new ApiError(
          "NOT_CONFIGURED",
          "Media storage не настроен (production credentials отсутствуют)",
          503,
        );
      }

      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new ApiError("VALIDATION_ERROR", "file обязателен", 400);
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new ApiError("VALIDATION_ERROR", "Файл больше 8MB", 400);
      }
      const mimeType = file.type || "application/octet-stream";
      if (!mimeType.startsWith("image/")) {
        throw new ApiError("VALIDATION_ERROR", "Только изображения", 400);
      }

      const locationIdRaw = form.get("locationId");
      const locationId =
        typeof locationIdRaw === "string" && locationIdRaw.length > 0 ? locationIdRaw : null;
      assertLocationAccess(actor, locationId);

      const altText =
        typeof form.get("altText") === "string" && String(form.get("altText")).length > 0
          ? String(form.get("altText"))
          : "Галерея";
      const caption =
        typeof form.get("caption") === "string" ? String(form.get("caption")) : null;
      const sortOrder = Number(form.get("sortOrder") ?? 0);

      const bytes = Buffer.from(await file.arrayBuffer());
      const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
      const key = `gallery/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
      const stored = await storage.upload({ key, bytes, mimeType });

      const media = await prisma.mediaObject.create({
        data: {
          key: stored.key,
          url: stored.url,
          mimeType: stored.mimeType ?? mimeType,
          byteSize: stored.byteSize ?? bytes.byteLength,
          altText,
        },
      });

      const item = await prisma.galleryItem.create({
        data: {
          locationId,
          mediaObjectId: media.id,
          imageUrl: media.url,
          altText,
          caption,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
          isPublished: true,
        },
        include: { mediaObject: true },
      });

      await recordAuditLog(prisma, {
        actorId: actor.id,
        action: "GALLERY_UPLOAD",
        entityType: "GalleryItem",
        entityId: item.id,
        after: {
          id: item.id,
          imageUrl: item.imageUrl,
          altText: item.altText,
          caption: item.caption,
          mediaKey: media.key,
        },
        ...meta,
      });

      revalidatePublicCms();
      return apiSuccess({ item });
    }

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = metaSchema
      .extend({
        imageUrl: z.string().url(),
        altText: z.string().min(1),
      })
      .parse(json);

    assertLocationAccess(actor, input.locationId);

    const item = await prisma.galleryItem.create({
      data: {
        locationId: input.locationId ?? null,
        imageUrl: input.imageUrl,
        altText: input.altText,
        caption: input.caption ?? null,
        sortOrder: input.sortOrder ?? 0,
        isPublished: input.isPublished ?? true,
      },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "GALLERY_CREATE",
      entityType: "GalleryItem",
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
