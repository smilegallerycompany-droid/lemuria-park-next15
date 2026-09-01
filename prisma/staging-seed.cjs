/**
 * Idempotent staging seed. Never prints DATABASE_URL or passwords.
 *
 * Requires:
 *   ALLOW_STAGING_SEED=1
 *   connected database name === lemuria_staging
 *
 * Optional:
 *   STAGING_SEED_PASSWORD — if set, upserts TEST staff users (hash only stored).
 */
"use strict";

const { PrismaClient } = require("@prisma/client");

const STAGING_DATABASE_NAME = "lemuria_staging";
const LOCATION_SLUG = "staging-test";
const SITE_SETTINGS_ID = "staging-site-settings";
const CONTACT_ID = "staging-contact-settings";
const TIMEZONE = "Europe/Moscow";
const OFFSET = "+03:00";
const PRICE_VALID_FROM = new Date("2026-01-01T00:00:00.000Z");

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

function databaseNameFromUrl(raw) {
  if (!raw || !String(raw).trim()) return null;
  try {
    const normalized = String(raw).replace(/^postgres(ql)?:/i, "http:");
    const url = new URL(normalized);
    const name = decodeURIComponent(url.pathname.replace(/^\//, "").split("/")[0] ?? "");
    return name || null;
  } catch {
    return null;
  }
}

function moscowInstant(dateIso, time) {
  return new Date(`${dateIso}T${time}:00${OFFSET}`);
}

function todayMoscow() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function addDaysIso(dateIso, days) {
  const d = new Date(`${dateIso}T12:00:00${OFFSET}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function weekdayEnum(dateIso) {
  const instant = moscowInstant(dateIso, "12:00");
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][
    instant.getUTCDay()
  ];
}

async function main() {
  if (process.env.ALLOW_STAGING_SEED !== "1") {
    throw new Error("Refusing: set ALLOW_STAGING_SEED=1 to run the staging seed.");
  }

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw`SELECT current_database() AS name`;
    const dbName = rows?.[0]?.name ?? databaseNameFromUrl(process.env.DATABASE_URL);
    if (dbName !== STAGING_DATABASE_NAME) {
      throw new Error(
        `Refusing: connected database is not ${STAGING_DATABASE_NAME}. Staging seed is blocked.`,
      );
    }

    const summary = {
      database: dbName,
      locationSlug: LOCATION_SLUG,
      ticketTypes: ["STAGING_ADULT", "STAGING_CHILD"],
      staff: [],
      sessionsUpserted: 0,
    };

    await prisma.siteSettings.upsert({
      where: { id: SITE_SETTINGS_ID },
      update: {
        siteName: "Лемурия Парк [STAGING / TEST]",
        siteSubtitle: "Тестовая площадка, не продаётся",
        ctaLabel: "TEST — записаться",
        heroBadge: "STAGING",
        heroTitle: "TEST / STAGING",
        metaTitle: "STAGING — Лемурия Парк",
      },
      create: {
        id: SITE_SETTINGS_ID,
        siteName: "Лемурия Парк [STAGING / TEST]",
        siteSubtitle: "Тестовая площадка, не продаётся",
        ctaLabel: "TEST — записаться",
        heroBadge: "STAGING",
        heroTitle: "TEST / STAGING",
        metaTitle: "STAGING — Лемурия Парк",
        sessionGenerationDays: 14,
        defaultCapacity: 8,
        defaultSessionInterval: 30,
      },
    });

    await prisma.contactSettings.upsert({
      where: { id: CONTACT_ID },
      update: {
        phone: "+7 000 000-00-00",
        complaintsPhone: "+7 000 000-00-00",
        email: "staging-test@example.invalid",
        supportHours: "STAGING ONLY — не рабочие контакты парка",
      },
      create: {
        id: CONTACT_ID,
        phone: "+7 000 000-00-00",
        complaintsPhone: "+7 000 000-00-00",
        email: "staging-test@example.invalid",
        supportHours: "STAGING ONLY — не рабочие контакты парка",
      },
    });

    const location = await prisma.location.upsert({
      where: { slug: LOCATION_SLUG },
      update: {
        name: "TEST / STAGING — не продаётся",
        city: "Staging-City",
        address: "Тестовый адрес, не использовать для визита",
        addressLine2: "STAGING ONLY",
        timezone: TIMEZONE,
        status: "ACTIVE",
        defaultCapacity: 8,
        sessionIntervalMinutes: 30,
        visitDurationMinutes: 20,
        activeFrom: moscowInstant("2026-08-01", "00:00"),
        activeTo: moscowInstant("2026-12-31", "23:59"),
        phone: "+7 000 000-00-00",
        email: "staging-test@example.invalid",
        mapLabel: "TEST / STAGING",
      },
      create: {
        slug: LOCATION_SLUG,
        name: "TEST / STAGING — не продаётся",
        city: "Staging-City",
        address: "Тестовый адрес, не использовать для визита",
        addressLine2: "STAGING ONLY",
        timezone: TIMEZONE,
        status: "ACTIVE",
        defaultCapacity: 8,
        sessionIntervalMinutes: 30,
        visitDurationMinutes: 20,
        activeFrom: moscowInstant("2026-08-01", "00:00"),
        activeTo: moscowInstant("2026-12-31", "23:59"),
        phone: "+7 000 000-00-00",
        email: "staging-test@example.invalid",
        mapLabel: "TEST / STAGING",
      },
    });

    for (const dayOfWeek of DAYS) {
      const isClosed = dayOfWeek === "TUESDAY";
      await prisma.locationSchedule.upsert({
        where: { locationId_dayOfWeek: { locationId: location.id, dayOfWeek } },
        update: { opensAt: "11:00", closesAt: "18:00", isClosed },
        create: {
          locationId: location.id,
          dayOfWeek,
          opensAt: "11:00",
          closesAt: "18:00",
          isClosed,
        },
      });
    }

    const adult = await prisma.ticketType.upsert({
      where: { code: "STAGING_ADULT" },
      update: {
        name: "TEST взрослый (staging)",
        description: "Только тестовая среда",
        minAge: 13,
        isActive: true,
        sortOrder: 1,
      },
      create: {
        code: "STAGING_ADULT",
        name: "TEST взрослый (staging)",
        description: "Только тестовая среда",
        minAge: 13,
        sortOrder: 1,
        isActive: true,
      },
    });

    const child = await prisma.ticketType.upsert({
      where: { code: "STAGING_CHILD" },
      update: {
        name: "TEST детский (staging)",
        description: "Только тестовая среда",
        minAge: 4,
        maxAge: 12,
        isActive: true,
        sortOrder: 2,
      },
      create: {
        code: "STAGING_CHILD",
        name: "TEST детский (staging)",
        description: "Только тестовая среда",
        minAge: 4,
        maxAge: 12,
        sortOrder: 2,
        isActive: true,
      },
    });

    const priceRows = [
      { ticketTypeId: adult.id, dayType: "WEEKDAY", priceAmount: 101 },
      { ticketTypeId: adult.id, dayType: "WEEKEND", priceAmount: 202 },
      { ticketTypeId: child.id, dayType: "WEEKDAY", priceAmount: 50 },
      { ticketTypeId: child.id, dayType: "WEEKEND", priceAmount: 75 },
    ];
    for (const rule of priceRows) {
      await prisma.priceRule.upsert({
        where: {
          locationId_ticketTypeId_dayType_validFrom: {
            locationId: location.id,
            ticketTypeId: rule.ticketTypeId,
            dayType: rule.dayType,
            validFrom: PRICE_VALID_FROM,
          },
        },
        update: { priceAmount: rule.priceAmount, isActive: true },
        create: {
          locationId: location.id,
          ticketTypeId: rule.ticketTypeId,
          dayType: rule.dayType,
          priceAmount: rule.priceAmount,
          validFrom: PRICE_VALID_FROM,
          isActive: true,
        },
      });
    }

    const start = todayMoscow();
    let made = 0;
    for (let offset = 0; offset < 10 && made < 6; offset += 1) {
      const dateIso = addDaysIso(start, offset);
      if (weekdayEnum(dateIso) === "TUESDAY") continue;
      for (const time of ["12:00", "14:00"]) {
        const startsAt = moscowInstant(dateIso, time);
        const endsAt = new Date(startsAt.getTime() + 20 * 60 * 1000);
        await prisma.session.upsert({
          where: { locationId_startsAt: { locationId: location.id, startsAt } },
          update: { endsAt, capacity: 8, status: "OPEN" },
          create: {
            locationId: location.id,
            startsAt,
            endsAt,
            capacity: 8,
            status: "OPEN",
          },
        });
        summary.sessionsUpserted += 1;
      }
      made += 1;
    }

    const seedPassword = process.env.STAGING_SEED_PASSWORD;
    if (seedPassword && seedPassword.length >= 16) {
      let bcrypt;
      try {
        bcrypt = require("bcryptjs");
      } catch {
        throw new Error("bcryptjs is required to seed staging staff passwords.");
      }
      const passwordHash = await bcrypt.hash(seedPassword, 10);
      const staff = [
        { email: "staging-owner@lemuria.test", name: "TEST Owner (staging)", role: "OWNER" },
        { email: "staging-admin@lemuria.test", name: "TEST Admin (staging)", role: "ADMIN" },
        { email: "staging-director@lemuria.test", name: "TEST Director (staging)", role: "DIRECTOR" },
        { email: "staging-cashier@lemuria.test", name: "TEST Cashier (staging)", role: "CASHIER" },
      ];
      for (const row of staff) {
        const user = await prisma.user.upsert({
          where: { email: row.email },
          update: { passwordHash, role: row.role, status: "ACTIVE", name: row.name },
          create: {
            email: row.email,
            name: row.name,
            passwordHash,
            role: row.role,
            status: "ACTIVE",
          },
        });
        await prisma.userLocation.upsert({
          where: { userId_locationId: { userId: user.id, locationId: location.id } },
          update: {},
          create: { userId: user.id, locationId: location.id },
        });
        summary.staff.push(row.email);
      }
    }

    console.log(JSON.stringify({ ok: true, seed: summary }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "staging seed failed");
  process.exit(1);
});
