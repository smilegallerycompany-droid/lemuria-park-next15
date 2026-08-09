import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_ABOUT,
  DEFAULT_FAQ,
  DEFAULT_HERO,
  parseAboutBenefits,
} from "@/lib/cms/defaults";
import { getPublicLocationsPayload } from "@/server/services/public-locations";
import { formatDateInTimezone } from "@/lib/datetime";

export async function getPublicCmsPayload() {
  const [settings, contact, faq, gallery, locations] = await Promise.all([
    prisma.siteSettings.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.contactSettings.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.faqItem.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.galleryItem.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 24,
    }),
    getPublicLocationsPayload(),
  ]);

  const benefits = parseAboutBenefits(settings?.aboutBenefits).filter((b) => b.isActive);
  const heroActive = settings?.heroActive ?? true;

  const primarySlug = locations.locations[0]?.slug;
  let schedulePreview: Array<{
    startsAt: string;
    localTime: string;
    remainingHint: string;
  }> = [];

  if (primarySlug) {
    const now = new Date();
    const sessions = await prisma.session.findMany({
      where: {
        location: { slug: primarySlug },
        startsAt: { gte: now },
        status: { in: ["SCHEDULED", "OPEN"] },
      },
      orderBy: { startsAt: "asc" },
      take: 6,
      include: {
        location: { select: { timezone: true } },
        _count: { select: { tickets: true } },
      },
    });
    schedulePreview = sessions.map((s) => {
      const free = Math.max(0, s.capacity - s._count.tickets);
      const tz = s.location.timezone || "Europe/Moscow";
      const localTime = new Intl.DateTimeFormat("ru-RU", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
      }).format(s.startsAt);
      const localDate = formatDateInTimezone(s.startsAt, tz);
      return {
        startsAt: s.startsAt.toISOString(),
        localTime: `${localDate} ${localTime}`,
        remainingHint: free <= 0 ? "Sold out" : `осталось ${free}`,
      };
    });
  }

  return {
    site: {
      name: settings?.siteName ?? "Лемурия Парк",
      subtitle: settings?.siteSubtitle ?? "Зоотеатр лемуров",
      ctaLabel: settings?.ctaLabel ?? "Купить билет",
    },
    hero: heroActive
      ? {
          badge: settings?.heroBadge ?? DEFAULT_HERO.heroBadge,
          title: settings?.heroTitle ?? DEFAULT_HERO.heroTitle,
          subtitle: settings?.heroSubtitle ?? DEFAULT_HERO.heroSubtitle,
          description: settings?.heroDescription ?? DEFAULT_HERO.heroDescription,
          ctaLabel: settings?.heroCtaLabel ?? settings?.ctaLabel ?? DEFAULT_HERO.heroCtaLabel,
          ctaHref: settings?.heroCtaHref ?? DEFAULT_HERO.heroCtaHref,
          imageUrl: settings?.heroImageUrl ?? DEFAULT_HERO.heroImageUrl,
        }
      : null,
    about: {
      eyebrow: settings?.aboutEyebrow ?? DEFAULT_ABOUT.aboutEyebrow,
      title: settings?.aboutTitle ?? DEFAULT_ABOUT.aboutTitle,
      description: settings?.aboutDescription ?? DEFAULT_ABOUT.aboutDescription,
      benefits: benefits.length ? benefits : DEFAULT_ABOUT.aboutBenefits,
    },
    faq:
      faq.length > 0
        ? faq.map((f) => ({ question: f.question, answer: f.answer }))
        : DEFAULT_FAQ,
    gallery: gallery.map((g) => ({
      imageUrl: g.imageUrl,
      altText: g.altText,
      caption: g.caption,
    })),
    contact: contact
      ? {
          phone: contact.phone,
          email: contact.email,
          supportHours: contact.supportHours,
        }
      : null,
    schedulePreview,
    locations,
  };
}
