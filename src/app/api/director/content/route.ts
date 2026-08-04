import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";

const faqSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1),
  answer: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isPublished: z.boolean().default(true),
});

const gallerySchema = z.object({
  id: z.string().optional(),
  locationId: z.string().nullable().optional(),
  imageUrl: z.string().url(),
  altText: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isPublished: z.boolean().default(true),
});

const patchSchema = z.object({
  site: z
    .object({
      siteName: z.string().optional(),
      siteSubtitle: z.string().optional(),
      ctaLabel: z.string().optional(),
      defaultSessionInterval: z.number().int().optional(),
      defaultCapacity: z.number().int().optional(),
      sessionGenerationDays: z.number().int().optional(),
      maintenanceMode: z.boolean().optional(),
      metaTitle: z.string().nullable().optional(),
      metaDescription: z.string().nullable().optional(),
    })
    .optional(),
  contact: z
    .object({
      phone: z.string().optional(),
      complaintsPhone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      supportHours: z.string().nullable().optional(),
    })
    .optional(),
  faq: z.array(faqSchema).optional(),
  gallery: z.array(gallerySchema).optional(),
});

async function loadContentBundle() {
  const [siteSettings, contactSettings, faq, gallery] = await Promise.all([
    prisma.siteSettings.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.contactSettings.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.faqItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.galleryItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { location: { select: { id: true, name: true } } },
    }),
  ]);
  return { siteSettings, contactSettings, faq, gallery };
}

export async function GET() {
  try {
    await requireDirector();
    const content = await loadContentBundle();
    return apiSuccess(content);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requireDirector();
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = patchSchema.parse(json);
    const meta = requestMeta(req);
    const before = await loadContentBundle();

    await prisma.$transaction(async (tx) => {
      if (input.site) {
        const existing = await tx.siteSettings.findFirst({ orderBy: { createdAt: "asc" } });
        if (existing) {
          await tx.siteSettings.update({ where: { id: existing.id }, data: input.site });
        } else {
          await tx.siteSettings.create({
            data: {
              id: "singleton-site-settings",
              siteName: input.site.siteName ?? "Лемурия Парк",
              ...input.site,
            },
          });
        }
      }

      if (input.contact) {
        const existing = await tx.contactSettings.findFirst({ orderBy: { createdAt: "asc" } });
        if (existing) {
          await tx.contactSettings.update({ where: { id: existing.id }, data: input.contact });
        } else {
          await tx.contactSettings.create({
            data: {
              phone: input.contact.phone ?? "+7 (000) 000-00-00",
              ...input.contact,
            },
          });
        }
      }

      if (input.faq) {
        for (const item of input.faq) {
          if (item.id) {
            await tx.faqItem.upsert({
              where: { id: item.id },
              update: item,
              create: item,
            });
          } else {
            await tx.faqItem.create({ data: item });
          }
        }
      }

      if (input.gallery) {
        for (const item of input.gallery) {
          if (item.id) {
            await tx.galleryItem.upsert({
              where: { id: item.id },
              update: item,
              create: item,
            });
          } else {
            await tx.galleryItem.create({ data: item });
          }
        }
      }
    });

    const after = await loadContentBundle();

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "CONTENT_UPDATE",
      entityType: "SiteSettings",
      metadata: { sections: Object.keys(input) },
      before,
      after,
      ...meta,
    });

    return apiSuccess(after);
  } catch (error) {
    return handleApiError(error);
  }
}
