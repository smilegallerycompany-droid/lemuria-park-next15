import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";
import { aboutBenefitSchema } from "@/lib/cms/defaults";
import { revalidatePublicCms } from "@/server/cms/revalidate";

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
      heroBadge: z.string().nullable().optional(),
      heroTitle: z.string().nullable().optional(),
      heroSubtitle: z.string().nullable().optional(),
      heroDescription: z.string().nullable().optional(),
      heroImageUrl: z.string().nullable().optional(),
      heroCtaLabel: z.string().nullable().optional(),
      heroCtaHref: z.string().nullable().optional(),
      heroActive: z.boolean().optional(),
      aboutEyebrow: z.string().nullable().optional(),
      aboutTitle: z.string().nullable().optional(),
      aboutDescription: z.string().nullable().optional(),
      aboutBenefits: z.array(aboutBenefitSchema).optional(),
      locationSectionTitle: z.string().nullable().optional(),
      supportPhone: z.string().nullable().optional(),
      supportEmail: z.string().nullable().optional(),
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
});

async function loadContentBundle() {
  const [siteSettings, contactSettings, faq, gallery] = await Promise.all([
    prisma.siteSettings.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.contactSettings.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.faqItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.galleryItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        location: { select: { id: true, name: true } },
        mediaObject: true,
      },
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
        const { aboutBenefits, ...rest } = input.site;
        const data = {
          ...rest,
          ...(aboutBenefits !== undefined ? { aboutBenefits } : {}),
        };
        const existing = await tx.siteSettings.findFirst({ orderBy: { createdAt: "asc" } });
        if (existing) {
          await tx.siteSettings.update({ where: { id: existing.id }, data });
        } else {
          await tx.siteSettings.create({
            data: {
              id: "singleton-site-settings",
              siteName: rest.siteName ?? "Лемурия Парк",
              ...data,
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
    });

    const after = await loadContentBundle();

    const action =
      input.site &&
      (input.site.heroTitle !== undefined ||
        input.site.heroBadge !== undefined ||
        input.site.heroActive !== undefined)
        ? "HERO_UPDATE"
        : "CONTENT_UPDATE";

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action,
      entityType: "SiteSettings",
      metadata: {
        sections: Object.keys(input),
        // never log image binary — only keys/urls already in settings
      },
      before: {
        siteSettings: before.siteSettings,
        contactSettings: before.contactSettings,
      },
      after: {
        siteSettings: after.siteSettings,
        contactSettings: after.contactSettings,
      },
      ...meta,
    });

    revalidatePublicCms();

    return apiSuccess(after);
  } catch (error) {
    return handleApiError(error);
  }
}
