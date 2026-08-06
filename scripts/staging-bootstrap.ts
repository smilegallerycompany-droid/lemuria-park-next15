/**
 * Staging-only bootstrap — NOT the demo seed.
 *
 * Creates minimal operational data from env (passwords never committed):
 *   STAGING_OWNER_EMAIL / STAGING_OWNER_PASSWORD / STAGING_OWNER_NAME
 *   STAGING_DIRECTOR_EMAIL / STAGING_DIRECTOR_PASSWORD / STAGING_DIRECTOR_NAME
 *   STAGING_CASHIER_EMAIL / STAGING_CASHIER_PASSWORD / STAGING_CASHIER_NAME
 *   STAGING_LOCATION_SLUG (default: krasnodar-stage)
 *
 * Refuses NODE_ENV=production without DEPLOY_ENV=staging.
 * Refuses weak passwords (ChangeMe123!, etc.).
 *
 * Usage:
 *   DEPLOY_ENV=staging DATABASE_URL=... npx tsx scripts/staging-bootstrap.ts
 */

import { createHash, randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { PrismaClient, type DayOfWeek } from "@prisma/client";

const prisma = new PrismaClient();

const WEEK_DAYS: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function assertStrongPassword(label: string, password: string) {
  if (password.length < 16) {
    throw new Error(`Password for ${label} must be at least 16 characters`);
  }
  const lower = password.toLowerCase();
  if (
    lower.includes("changeme") ||
    lower.includes("change-me") ||
    lower.includes("password") ||
    lower.includes("lemuria")
  ) {
    throw new Error(`Password for ${label} is too weak / matches forbidden patterns`);
  }
}

function moscowInstant(dateIso: string, hhmm: string): Date {
  return new Date(`${dateIso}T${hhmm}:00+03:00`);
}

function eachDate(from: string, days: number): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  for (let i = 0; i < days; i += 1) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

async function upsertStaff(params: {
  email: string;
  name: string;
  password: string;
  role: "OWNER" | "ADMIN" | "CASHIER";
  locationId: string;
}) {
  assertStrongPassword(params.email, params.password);
  const passwordHash = await hash(params.password, 12);
  const user = await prisma.user.upsert({
    where: { email: params.email.toLowerCase() },
    update: {
      name: params.name,
      passwordHash,
      role: params.role,
      status: "ACTIVE",
    },
    create: {
      email: params.email.toLowerCase(),
      name: params.name,
      passwordHash,
      role: params.role,
      status: "ACTIVE",
    },
  });
  await prisma.userLocation.upsert({
    where: { userId_locationId: { userId: user.id, locationId: params.locationId } },
    update: {},
    create: { userId: user.id, locationId: params.locationId },
  });
  // Revoke prior sessions after password rotation.
  await prisma.staffSession.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return user;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.DEPLOY_ENV !== "staging") {
    throw new Error("Refusing bootstrap: NODE_ENV=production requires DEPLOY_ENV=staging");
  }
  if (process.env.DEPLOY_ENV === "production") {
    throw new Error("Refusing bootstrap against DEPLOY_ENV=production");
  }

  const ownerEmail = requireEnv("STAGING_OWNER_EMAIL");
  const ownerPassword = requireEnv("STAGING_OWNER_PASSWORD");
  const directorEmail = requireEnv("STAGING_DIRECTOR_EMAIL");
  const directorPassword = requireEnv("STAGING_DIRECTOR_PASSWORD");
  const cashierEmail = requireEnv("STAGING_CASHIER_EMAIL");
  const cashierPassword = requireEnv("STAGING_CASHIER_PASSWORD");

  const slug = process.env.STAGING_LOCATION_SLUG?.trim() || "krasnodar-stage";
  const location = await prisma.location.upsert({
    where: { slug },
    update: {
      name: "Лемурия Парк — Staging Краснодар",
      city: "Краснодар",
      address: "Краснодар, МегаЦентр Красная площадь, 2 этаж рядом с Kari (STAGING)",
      status: "ACTIVE",
      timezone: "Europe/Moscow",
      defaultCapacity: 15,
      sessionIntervalMinutes: 30,
      visitDurationMinutes: 30,
    },
    create: {
      slug,
      name: "Лемурия Парк — Staging Краснодар",
      city: "Краснодар",
      address: "Краснодар, МегаЦентр Красная площадь, 2 этаж рядом с Kari (STAGING)",
      status: "ACTIVE",
      timezone: "Europe/Moscow",
      defaultCapacity: 15,
      sessionIntervalMinutes: 30,
      visitDurationMinutes: 30,
    },
  });

  for (const dayOfWeek of WEEK_DAYS) {
    const isClosed = dayOfWeek === "TUESDAY";
    await prisma.locationSchedule.upsert({
      where: { locationId_dayOfWeek: { locationId: location.id, dayOfWeek } },
      update: { opensAt: "10:30", closesAt: "21:00", isClosed, sessionIntervalMinutes: 30 },
      create: {
        locationId: location.id,
        dayOfWeek,
        opensAt: "10:30",
        closesAt: "21:00",
        isClosed,
        sessionIntervalMinutes: 30,
      },
    });
  }

  const adult = await prisma.ticketType.upsert({
    where: { code: "ADULT" },
    update: { name: "Взрослый", isActive: true },
    create: {
      code: "ADULT",
      name: "Взрослый",
      description: "От 12 лет",
      minAge: 12,
      sortOrder: 1,
      isActive: true,
    },
  });
  const child = await prisma.ticketType.upsert({
    where: { code: "CHILD" },
    update: { name: "Детский", isActive: true },
    create: {
      code: "CHILD",
      name: "Детский",
      description: "От 3 до 11 лет",
      minAge: 3,
      maxAge: 11,
      sortOrder: 2,
      isActive: true,
    },
  });

  const validFrom = new Date("2026-08-01T00:00:00.000Z");
  const priceRules = [
    { ticketTypeId: adult.id, dayType: "WEEKDAY" as const, priceAmount: 90000 },
    { ticketTypeId: child.id, dayType: "WEEKDAY" as const, priceAmount: 80000 },
    { ticketTypeId: adult.id, dayType: "WEEKEND" as const, priceAmount: 110000 },
    { ticketTypeId: child.id, dayType: "WEEKEND" as const, priceAmount: 100000 },
  ];
  for (const rule of priceRules) {
    await prisma.priceRule.upsert({
      where: {
        locationId_ticketTypeId_dayType_validFrom: {
          locationId: location.id,
          ticketTypeId: rule.ticketTypeId,
          dayType: rule.dayType,
          validFrom,
        },
      },
      update: { priceAmount: rule.priceAmount, isActive: true },
      create: {
        locationId: location.id,
        ticketTypeId: rule.ticketTypeId,
        dayType: rule.dayType,
        priceAmount: rule.priceAmount,
        validFrom,
        isActive: true,
      },
    });
  }

  // Future sessions: next days in Europe/Moscow, skip closed Tuesdays.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
  let createdSessions = 0;
  for (const dateIso of eachDate(today, 10)) {
    const weekday = new Date(`${dateIso}T12:00:00+03:00`).toLocaleDateString("en-US", {
      timeZone: "Europe/Moscow",
      weekday: "short",
    });
    if (weekday === "Tue") continue;
    for (const time of ["11:00", "12:00", "14:00", "16:00", "18:00"]) {
      const startsAt = moscowInstant(dateIso, time);
      if (startsAt.getTime() <= Date.now()) continue;
      const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
      await prisma.session.upsert({
        where: { locationId_startsAt: { locationId: location.id, startsAt } },
        update: { status: "SCHEDULED", capacity: 15, endsAt },
        create: {
          locationId: location.id,
          startsAt,
          endsAt,
          capacity: 15,
          status: "SCHEDULED",
        },
      });
      createdSessions += 1;
    }
  }

  await upsertStaff({
    email: ownerEmail,
    name: process.env.STAGING_OWNER_NAME?.trim() || "Staging Owner",
    password: ownerPassword,
    role: "OWNER",
    locationId: location.id,
  });
  await upsertStaff({
    email: directorEmail,
    name: process.env.STAGING_DIRECTOR_NAME?.trim() || "Staging Director",
    password: directorPassword,
    role: "ADMIN",
    locationId: location.id,
  });
  await upsertStaff({
    email: cashierEmail,
    name: process.env.STAGING_CASHIER_NAME?.trim() || "Staging Cashier",
    password: cashierPassword,
    role: "CASHIER",
    locationId: location.id,
  });

  await prisma.siteSettings.upsert({
    where: { id: "singleton-site-settings" },
    update: {
      siteName: "Лемурия Парк (Staging)",
      siteSubtitle: "Зоотеатр лемуров — staging",
      maintenanceMode: false,
      sessionGenerationDays: 14,
    },
    create: {
      id: "singleton-site-settings",
      siteName: "Лемурия Парк (Staging)",
      siteSubtitle: "Зоотеатр лемуров — staging",
      ctaLabel: "Купить билет",
      maintenanceMode: false,
      defaultCapacity: 15,
      defaultSessionInterval: 30,
      sessionGenerationDays: 14,
    },
  });

  // Fingerprint only — never print passwords.
  const fingerprint = createHash("sha256")
    .update(`${ownerEmail}|${directorEmail}|${cashierEmail}|${randomBytes(4).toString("hex")}`)
    .digest("hex")
    .slice(0, 12);

  console.log("✅ Staging bootstrap complete");
  console.log(`   Location slug: ${slug}`);
  console.log(`   Sessions upserted (approx): ${createdSessions}`);
  console.log(`   Staff: OWNER / ADMIN / CASHIER (emails from env)`);
  console.log(`   Fingerprint: ${fingerprint}`);
  console.log("   Rotate passwords after first login via Director → Staff.");
}

main()
  .catch((error) => {
    console.error("❌ Staging bootstrap failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
