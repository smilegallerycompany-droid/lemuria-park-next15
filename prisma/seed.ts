import { PrismaClient, type DayOfWeek, type PriceDayType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Moscow (MSK) has used a fixed UTC+3 offset year-round since 2014 (no DST),
 * so seed data for the demo location can safely use an explicit ISO offset
 * instead of a general-purpose timezone conversion library. Production
 * services (see src/lib/datetime.ts) use the generic `Intl` API instead and
 * work for any IANA timezone.
 */
const DEMO_LOCATION_TIMEZONE = "Europe/Moscow";
const DEMO_LOCATION_OFFSET = "+03:00";

function moscowInstant(dateIso: string, time: string): Date {
  return new Date(`${dateIso}T${time}:00${DEMO_LOCATION_OFFSET}`);
}

function toDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

const WEEK_DAYS: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

/** Maps `Date#getUTCDay()` (0 = Sunday) to our `DayOfWeek` enum. */
const JS_DAY_TO_ENUM: DayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

async function seedSiteAndContactSettings() {
  await prisma.siteSettings.upsert({
    where: { id: "singleton-site-settings" },
    update: {},
    create: {
      id: "singleton-site-settings",
      siteName: "Лемурия Парк",
      siteSubtitle: "Зоотеатр лемуров",
      ctaLabel: "Купить билет",
      defaultSessionInterval: 30,
      defaultCapacity: 15,
    },
  });

  await prisma.contactSettings.upsert({
    where: { id: "singleton-contact-settings" },
    update: {},
    create: {
      id: "singleton-contact-settings",
      phone: "+7 920 971-40-22",
      complaintsPhone: "+7 915 356-00-57",
      email: "info@lemuriapark.ru",
      supportHours: "Ежедневно, 10:30–21:00",
    },
  });
}

async function seedUsers() {
  const ownerPasswordHash = await bcrypt.hash("ChangeMe123!", 10);
  const cashierPasswordHash = await bcrypt.hash("ChangeMe123!", 10);

  const owner = await prisma.user.upsert({
    where: { email: "owner@lemuriapark.ru" },
    update: {},
    create: {
      email: "owner@lemuriapark.ru",
      name: "Владелец",
      passwordHash: ownerPasswordHash,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  await prisma.user.upsert({
    where: { email: "cashier@lemuriapark.ru" },
    update: {},
    create: {
      email: "cashier@lemuriapark.ru",
      name: "Кассир",
      passwordHash: cashierPasswordHash,
      role: "CASHIER",
      status: "ACTIVE",
    },
  });

  return { owner };
}

async function seedTicketTypes() {
  const adult = await prisma.ticketType.upsert({
    where: { code: "ADULT" },
    update: {},
    create: {
      code: "ADULT",
      name: "Взрослый",
      description: "От 12 лет",
      minAge: 12,
      sortOrder: 1,
    },
  });

  const child = await prisma.ticketType.upsert({
    where: { code: "CHILD" },
    update: {},
    create: {
      code: "CHILD",
      name: "Детский",
      description: "От 3 до 11 лет",
      minAge: 3,
      maxAge: 11,
      sortOrder: 2,
    },
  });

  return { adult, child };
}

async function seedLocation() {
  return prisma.location.upsert({
    where: { slug: "moscow-vdnh" },
    update: {},
    create: {
      slug: "moscow-vdnh",
      name: "Лемурия Парк — Москва, ВДНХ",
      city: "Москва",
      address: "Адрес текущей площадки уточняется",
      timezone: DEMO_LOCATION_TIMEZONE,
      status: "ACTIVE",
      defaultCapacity: 15,
      sessionIntervalMinutes: 30,
      visitDurationMinutes: 45,
      activeFrom: new Date(),
      phone: "+7 920 971-40-22",
    },
  });
}

async function seedLocationSchedule(locationId: string) {
  const schedules = await Promise.all(
    WEEK_DAYS.map((dayOfWeek) =>
      prisma.locationSchedule.upsert({
        where: { locationId_dayOfWeek: { locationId, dayOfWeek } },
        update: {},
        create: { locationId, dayOfWeek, opensAt: "10:30", closesAt: "21:00" },
      }),
    ),
  );
  return schedules;
}

async function seedPriceRules(locationId: string, ticketTypeIds: { adult: string; child: string }) {
  // Fixed validFrom keeps this idempotent across re-runs (stable unique key).
  const validFrom = new Date("2026-01-01T00:00:00Z");

  const rules: Array<{ ticketTypeId: string; dayType: PriceDayType; priceAmount: number }> = [
    { ticketTypeId: ticketTypeIds.adult, dayType: "WEEKDAY", priceAmount: 80000 }, // 800 RUB
    { ticketTypeId: ticketTypeIds.adult, dayType: "WEEKEND", priceAmount: 90000 }, // 900 RUB
    { ticketTypeId: ticketTypeIds.child, dayType: "WEEKDAY", priceAmount: 60000 }, // 600 RUB
    { ticketTypeId: ticketTypeIds.child, dayType: "WEEKEND", priceAmount: 70000 }, // 700 RUB
  ];

  for (const rule of rules) {
    await prisma.priceRule.upsert({
      where: {
        locationId_ticketTypeId_dayType_validFrom: {
          locationId,
          ticketTypeId: rule.ticketTypeId,
          dayType: rule.dayType,
          validFrom,
        },
      },
      update: { priceAmount: rule.priceAmount },
      create: {
        locationId,
        ticketTypeId: rule.ticketTypeId,
        dayType: rule.dayType,
        priceAmount: rule.priceAmount,
        validFrom,
      },
    });
  }
}

async function seedSessions(location: {
  id: string;
  defaultCapacity: number;
  sessionIntervalMinutes: number;
  visitDurationMinutes: number;
}) {
  const schedules = await prisma.locationSchedule.findMany({ where: { locationId: location.id } });
  const scheduleByDay = new Map(schedules.map((schedule) => [schedule.dayOfWeek, schedule]));

  const today = new Date();
  let createdCount = 0;
  let isFirstSession = true;

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const day = addDays(today, dayOffset);
    const dateIso = toDateIso(day);
    const dayOfWeek = JS_DAY_TO_ENUM[day.getUTCDay()];
    const schedule = scheduleByDay.get(dayOfWeek);
    if (!schedule || schedule.isClosed) continue;

    const interval = schedule.sessionIntervalMinutes ?? location.sessionIntervalMinutes;
    const opensAtMinutes = parseMinutes(schedule.opensAt);
    const closesAtMinutes = parseMinutes(schedule.closesAt);

    for (
      let minutes = opensAtMinutes;
      minutes + location.visitDurationMinutes <= closesAtMinutes;
      minutes += interval
    ) {
      const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
      const mm = String(minutes % 60).padStart(2, "0");
      const startsAt = moscowInstant(dateIso, `${hh}:${mm}`);
      const endsAt = new Date(startsAt.getTime() + location.visitDurationMinutes * 60 * 1000);

      // Demonstrates the per-session capacity override business rule.
      const capacity = isFirstSession ? 10 : location.defaultCapacity;
      isFirstSession = false;

      await prisma.session.upsert({
        where: { locationId_startsAt: { locationId: location.id, startsAt } },
        update: {},
        create: {
          locationId: location.id,
          startsAt,
          endsAt,
          capacity,
          status: "SCHEDULED",
        },
      });
      createdCount += 1;
    }
  }

  return createdCount;
}

async function seedFaqAndGallery(locationId: string) {
  await prisma.faqItem.upsert({
    where: { id: "faq-visit-duration" },
    update: {},
    create: {
      id: "faq-visit-duration",
      question: "Сколько длится программа?",
      answer: "Продолжительность программы уточняйте у администратора зоотеатра.",
      sortOrder: 1,
    },
  });

  await prisma.faqItem.upsert({
    where: { id: "faq-tickets" },
    update: {},
    create: {
      id: "faq-tickets",
      question: "Как купить билет?",
      answer: "Билеты можно купить онлайн на сайте или в кассе перед сеансом.",
      sortOrder: 2,
    },
  });

  await prisma.galleryItem.upsert({
    where: { id: "gallery-demo-1" },
    update: {},
    create: {
      id: "gallery-demo-1",
      locationId,
      imageUrl: "/gallery/placeholder-1.jpg",
      altText: "Лемур в зоотеатре Лемурия Парк",
      sortOrder: 1,
    },
  });
}

async function main() {
  console.log("🌱 Seeding database...");

  await seedSiteAndContactSettings();
  const { owner } = await seedUsers();
  const { adult, child } = await seedTicketTypes();
  const location = await seedLocation();
  await seedLocationSchedule(location.id);
  await seedPriceRules(location.id, { adult: adult.id, child: child.id });
  await seedFaqAndGallery(location.id);
  const sessionsCreated = await seedSessions(location);

  console.log("✅ Seed complete:");
  console.log(`   Owner user:      ${owner.email}`);
  console.log(`   Location:        ${location.name} (${location.slug})`);
  console.log(`   Ticket types:    ${adult.name}, ${child.name}`);
  console.log(`   Sessions ready:  ${sessionsCreated}`);
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
