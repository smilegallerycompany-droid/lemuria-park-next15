import { randomBytes } from "node:crypto";
import { PrismaClient, type DayOfWeek, type PriceDayType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Demo staff password for local/staging seeds only.
 * NEVER use ChangeMe123! (or any seed default) in production.
 * `main()` refuses to run when NODE_ENV === "production".
 */
const DEMO_PASSWORD = "ChangeMe123!";

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
    update: { sessionGenerationDays: 60 },
    create: {
      id: "singleton-site-settings",
      siteName: "Лемурия Парк",
      siteSubtitle: "Зоотеатр лемуров",
      ctaLabel: "Купить билет",
      defaultSessionInterval: 30,
      defaultCapacity: 15,
      sessionGenerationDays: 60,
    },
  });

  await prisma.contactSettings.upsert({
    where: { id: "singleton-contact-settings" },
    update: {
      supportHours: "Ежедневно кроме вторника, 10:30-21:00",
    },
    create: {
      id: "singleton-contact-settings",
      phone: "+7 920 971-40-22",
      complaintsPhone: "+7 915 356-00-57",
      email: "info@lemuriapark.ru",
      supportHours: "Ежедневно кроме вторника, 10:30-21:00",
    },
  });
}

/** Krasnodar exhibition window (inclusive local calendar dates). */
const EXHIBITION_FROM = "2026-08-01";
const EXHIBITION_TO = "2026-09-15";

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const owner = await prisma.user.upsert({
    where: { email: "owner@lemuriapark.ru" },
    update: {
      passwordHash,
      role: "OWNER",
      status: "ACTIVE",
      name: "Владелец",
    },
    create: {
      email: "owner@lemuriapark.ru",
      name: "Владелец",
      passwordHash,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@lemuriapark.ru" },
    update: {
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
    create: {
      email: "admin@lemuriapark.ru",
      name: "Администратор",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const cashier = await prisma.user.upsert({
    where: { email: "cashier@lemuriapark.ru" },
    update: {
      passwordHash,
      role: "CASHIER",
      status: "ACTIVE",
    },
    create: {
      email: "cashier@lemuriapark.ru",
      name: "Кассир",
      passwordHash,
      role: "CASHIER",
      status: "ACTIVE",
    },
  });

  await prisma.user.upsert({
    where: { email: "cashier2@lemuriapark.ru" },
    update: {
      passwordHash,
      role: "CASHIER",
      status: "ACTIVE",
      name: "Кассир 2",
    },
    create: {
      email: "cashier2@lemuriapark.ru",
      name: "Кассир 2",
      passwordHash,
      role: "CASHIER",
      status: "ACTIVE",
    },
  });

  await prisma.user.upsert({
    where: { email: "disabled@lemuriapark.ru" },
    update: {
      passwordHash,
      role: "CASHIER",
      status: "DISABLED",
      name: "Отключённый",
    },
    create: {
      email: "disabled@lemuriapark.ru",
      name: "Отключённый",
      passwordHash,
      role: "CASHIER",
      status: "DISABLED",
    },
  });

  return { owner, cashier };
}

async function seedTicketTypes() {
  const adult = await prisma.ticketType.upsert({
    where: { code: "ADULT" },
    update: {
      name: "Взрослый",
      description: "От 13 лет",
      minAge: 13,
      maxAge: null,
    },
    create: {
      code: "ADULT",
      name: "Взрослый",
      description: "От 13 лет",
      minAge: 13,
      sortOrder: 1,
    },
  });

  const child = await prisma.ticketType.upsert({
    where: { code: "CHILD" },
    update: {
      name: "Детский",
      description: "4–12 лет",
      minAge: 4,
      maxAge: 12,
    },
    create: {
      code: "CHILD",
      name: "Детский",
      description: "4–12 лет",
      minAge: 4,
      maxAge: 12,
      sortOrder: 2,
    },
  });

  const infant = await prisma.ticketType.upsert({
    where: { code: "INFANT" },
    update: {
      name: "До 3 лет",
      description: "До 3 лет включительно, бесплатно",
      minAge: 0,
      maxAge: 3,
    },
    create: {
      code: "INFANT",
      name: "До 3 лет",
      description: "До 3 лет включительно, бесплатно",
      minAge: 0,
      maxAge: 3,
      sortOrder: 3,
    },
  });

  return { adult, child, infant };
}

async function seedLocation() {
  const activeFrom = moscowInstant(EXHIBITION_FROM, "00:00");
  const activeTo = moscowInstant(EXHIBITION_TO, "23:59");

  return prisma.location.upsert({
    where: { slug: "moscow-vdnh" },
    update: {
      name: "Лемурия Парк, Краснодар, МегаЦентр Красная площадь",
      city: "Краснодар",
      address: "Мегацентр «Красная Площадь», ул. Дзержинского, 100",
      addressLine2: "2 этаж, рядом с магазином Kari",
      phone: "+7 920 971-40-22",
      email: "hello@lemuriapark.ru",
      latitude: 45.01847,
      longitude: 39.02691,
      mapZoom: 16,
      mapLabel: "Лемурия Парк",
      routeUrl:
        "https://yandex.ru/maps/?rtext=~45.01847%2C39.02691&rtt=auto&text=%D0%9C%D0%B5%D0%B3%D0%B0%D1%86%D0%B5%D0%BD%D1%82%D1%80%20%D0%9A%D1%80%D0%B0%D1%81%D0%BD%D0%B0%D1%8F%20%D0%9F%D0%BB%D0%BE%D1%89%D0%B0%D0%B4%D1%8C",
      mapUrl:
        "https://yandex.ru/maps/?rtext=~45.01847%2C39.02691&rtt=auto&text=%D0%9C%D0%B5%D0%B3%D0%B0%D1%86%D0%B5%D0%BD%D1%82%D1%80%20%D0%9A%D1%80%D0%B0%D1%81%D0%BD%D0%B0%D1%8F%20%D0%9F%D0%BB%D0%BE%D1%89%D0%B0%D0%B4%D1%8C",
      activeFrom,
      activeTo,
      status: "ACTIVE",
      visitDurationMinutes: 20,
    },
    create: {
      slug: "moscow-vdnh",
      name: "Лемурия Парк, Краснодар, МегаЦентр Красная площадь",
      city: "Краснодар",
      address: "Мегацентр «Красная Площадь», ул. Дзержинского, 100",
      addressLine2: "2 этаж, рядом с магазином Kari",
      timezone: DEMO_LOCATION_TIMEZONE,
      status: "ACTIVE",
      defaultCapacity: 15,
      sessionIntervalMinutes: 30,
      visitDurationMinutes: 20,
      activeFrom,
      activeTo,
      phone: "+7 920 971-40-22",
      email: "hello@lemuriapark.ru",
      latitude: 45.01847,
      longitude: 39.02691,
      mapZoom: 16,
      mapLabel: "Лемурия Парк",
      routeUrl:
        "https://yandex.ru/maps/?rtext=~45.01847%2C39.02691&rtt=auto&text=%D0%9C%D0%B5%D0%B3%D0%B0%D1%86%D0%B5%D0%BD%D1%82%D1%80%20%D0%9A%D1%80%D0%B0%D1%81%D0%BD%D0%B0%D1%8F%20%D0%9F%D0%BB%D0%BE%D1%89%D0%B0%D0%B4%D1%8C",
      mapUrl:
        "https://yandex.ru/maps/?rtext=~45.01847%2C39.02691&rtt=auto&text=%D0%9C%D0%B5%D0%B3%D0%B0%D1%86%D0%B5%D0%BD%D1%82%D1%80%20%D0%9A%D1%80%D0%B0%D1%81%D0%BD%D0%B0%D1%8F%20%D0%9F%D0%BB%D0%BE%D1%89%D0%B0%D0%B4%D1%8C",
    },
  });
}

async function seedLocationSchedule(locationId: string) {
  const schedules = await Promise.all(
    WEEK_DAYS.map((dayOfWeek) => {
      const isClosed = dayOfWeek === "TUESDAY";
      return prisma.locationSchedule.upsert({
        where: { locationId_dayOfWeek: { locationId, dayOfWeek } },
        update: {
          opensAt: "10:30",
          closesAt: "21:00",
          isClosed,
        },
        create: {
          locationId,
          dayOfWeek,
          opensAt: "10:30",
          closesAt: "21:00",
          isClosed,
        },
      });
    }),
  );
  return schedules;
}

async function seedPriceRules(
  locationId: string,
  ticketTypeIds: { adult: string; child: string; infant: string },
) {
  // Fixed validFrom keeps this idempotent across re-runs (stable unique key).
  const validFrom = new Date("2026-01-01T00:00:00Z");

  const rules: Array<{ ticketTypeId: string; dayType: PriceDayType; priceAmount: number }> = [
    { ticketTypeId: ticketTypeIds.adult, dayType: "WEEKDAY", priceAmount: 90000 }, // 900 RUB
    { ticketTypeId: ticketTypeIds.adult, dayType: "WEEKEND", priceAmount: 110000 }, // 1100 RUB
    { ticketTypeId: ticketTypeIds.child, dayType: "WEEKDAY", priceAmount: 80000 }, // 800 RUB
    { ticketTypeId: ticketTypeIds.child, dayType: "WEEKEND", priceAmount: 100000 }, // 1000 RUB
    { ticketTypeId: ticketTypeIds.infant, dayType: "WEEKDAY", priceAmount: 0 },
    { ticketTypeId: ticketTypeIds.infant, dayType: "WEEKEND", priceAmount: 0 },
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

function eachExhibitionDate(): string[] {
  const out: string[] = [];
  const cursor = new Date(`${EXHIBITION_FROM}T12:00:00Z`);
  const end = new Date(`${EXHIBITION_TO}T12:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function dayOfWeekFromLocalDate(dateIso: string): DayOfWeek {
  // Noon MSK avoids DST/boundary ambiguity for the calendar weekday.
  const instant = moscowInstant(dateIso, "12:00");
  return JS_DAY_TO_ENUM[instant.getUTCDay()];
}

async function removeClosedDaySessions(locationId: string) {
  const sessions = await prisma.session.findMany({
    where: { locationId, status: { in: ["SCHEDULED", "OPEN"] } },
    select: { id: true, startsAt: true },
  });

  const closedIds: string[] = [];
  for (const session of sessions) {
    const localDate = session.startsAt.toLocaleDateString("en-CA", {
      timeZone: DEMO_LOCATION_TIMEZONE,
    });
    if (dayOfWeekFromLocalDate(localDate) === "TUESDAY") {
      closedIds.push(session.id);
    }
  }

  if (closedIds.length === 0) return;

  // Never delete sessions that already have orders (financial history / FK).
  const withOrders = await prisma.order.findMany({
    where: { sessionId: { in: closedIds } },
    select: { sessionId: true },
    distinct: ["sessionId"],
  });
  const protectedIds = new Set(withOrders.map((row) => row.sessionId));
  const deletable = closedIds.filter((id) => !protectedIds.has(id));
  const toCancel = closedIds.filter((id) => protectedIds.has(id));

  if (deletable.length > 0) {
    await prisma.session.deleteMany({ where: { id: { in: deletable } } });
  }
  if (toCancel.length > 0) {
    await prisma.session.updateMany({
      where: { id: { in: toCancel } },
      data: { status: "CANCELLED" },
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

  await removeClosedDaySessions(location.id);

  let createdCount = 0;
  let isFirstSession = true;

  for (const dateIso of eachExhibitionDate()) {
    const dayOfWeek = dayOfWeekFromLocalDate(dateIso);
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
      // Mix of availability statuses for director demos (most stay SCHEDULED).
      let status: "SCHEDULED" | "OPEN" | "CLOSED" | "CANCELLED" = "SCHEDULED";
      if (createdCount === 3) status = "OPEN";
      if (createdCount === 7) status = "CLOSED";
      if (createdCount === 11) status = "CANCELLED";
      isFirstSession = false;

      await prisma.session.upsert({
        where: { locationId_startsAt: { locationId: location.id, startsAt } },
        // Preserve existing status on re-seed so demo commerce FKs stay consistent.
        update: { capacity, endsAt },
        create: {
          locationId: location.id,
          startsAt,
          endsAt,
          capacity,
          status,
        },
      });
      createdCount += 1;
    }
  }

  return createdCount;
}

function demoOrderNumber(suffix: string): string {
  return `LP-SEED${suffix}`;
}

function demoQr(label: string): string {
  return `seed-qr-${label}-${randomBytes(8).toString("hex")}`;
}

/**
 * Rich demo orders/tickets for director analytics & staff training.
 * Idempotent via stable order numbers.
 */
/**
 * Ensures bookable sessions exist for the current local calendar day even when
 * the weekly schedule marks the day closed (e.g. Tuesday). Needed for cashier
 * check-in demos and E2E on closed weekdays. Demo / non-production only.
 */
async function ensureTodayDemoSessions(location: {
  id: string;
  visitDurationMinutes: number;
  defaultCapacity: number;
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: DEMO_LOCATION_TIMEZONE });
  // Spread across the day so E2E/check-in still have future startsAt in the evening.
  const slots = ["12:00", "14:00", "16:00", "18:00", "18:30", "19:00", "20:00", "21:00", "22:00"];
  for (const time of slots) {
    const startsAt = moscowInstant(today, time);
    const endsAt = new Date(startsAt.getTime() + location.visitDurationMinutes * 60 * 1000);
    await prisma.session.upsert({
      where: { locationId_startsAt: { locationId: location.id, startsAt } },
      update: { status: "SCHEDULED", capacity: location.defaultCapacity },
      create: {
        locationId: location.id,
        startsAt,
        endsAt,
        capacity: location.defaultCapacity,
        status: "SCHEDULED",
      },
    });
  }
}

async function seedDemoCommerce(params: {
  locationId: string;
  cashierId: string;
  adultTicketTypeId: string;
  childTicketTypeId: string;
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: DEMO_LOCATION_TIMEZONE });
  const todaySessions = await prisma.session.findMany({
    where: {
      locationId: params.locationId,
      status: { in: ["SCHEDULED", "OPEN"] },
      startsAt: {
        gte: moscowInstant(today, "00:00"),
        lte: moscowInstant(today, "23:59"),
      },
    },
    orderBy: { startsAt: "asc" },
    take: 6,
  });

  if (todaySessions.length < 2) {
    console.log("⚠️  Skipping demo commerce — need ≥2 sessions today");
    return;
  }

  const [sessionA, sessionB] = todaySessions;

  // PAID online order + VALID ticket
  const onlinePaid = await prisma.order.upsert({
    where: { number: demoOrderNumber("ONPAY01") },
    update: { status: "PAID" },
    create: {
      number: demoOrderNumber("ONPAY01"),
      sessionId: sessionA.id,
      locationId: params.locationId,
      status: "PAID",
      source: "ONLINE",
      customerName: "Онлайн Гость",
      customerPhone: "+79001112233",
      customerEmail: "online-paid@example.com",
      totalAmount: 90000,
      items: {
        create: [
          {
            ticketTypeId: params.adultTicketTypeId,
            ticketTypeName: "Взрослый",
            quantity: 1,
            unitPriceAmount: 90000,
            subtotalAmount: 90000,
          },
        ],
      },
      payments: {
        create: [
          {
            method: "CARD_ONLINE",
            status: "SUCCEEDED",
            amount: 90000,
            provider: "yookassa",
            providerPaymentId: "seed-pay-online-01",
          },
        ],
      },
    },
    include: { items: true, tickets: true },
  });

  if (onlinePaid.tickets.length === 0 && onlinePaid.items[0]) {
    await prisma.ticket.create({
      data: {
        orderId: onlinePaid.id,
        orderItemId: onlinePaid.items[0].id,
        sessionId: sessionA.id,
        ticketTypeId: params.adultTicketTypeId,
        status: "VALID",
        qrToken: demoQr("online-valid"),
      },
    });
  }

  // PAID cashier order + USED ticket
  const cashierPaid = await prisma.order.upsert({
    where: { number: demoOrderNumber("CASH01") },
    update: { status: "PAID", cashierId: params.cashierId },
    create: {
      number: demoOrderNumber("CASH01"),
      sessionId: sessionA.id,
      locationId: params.locationId,
      status: "PAID",
      source: "CASHIER",
      cashierId: params.cashierId,
      customerName: "Кассовый Гость",
      customerPhone: "+79004445566",
      customerEmail: "cashier-paid@example.com",
      totalAmount: 170000,
      items: {
        create: [
          {
            ticketTypeId: params.adultTicketTypeId,
            ticketTypeName: "Взрослый",
            quantity: 1,
            unitPriceAmount: 90000,
            subtotalAmount: 90000,
          },
          {
            ticketTypeId: params.childTicketTypeId,
            ticketTypeName: "Детский",
            quantity: 1,
            unitPriceAmount: 80000,
            subtotalAmount: 80000,
          },
        ],
      },
      payments: {
        create: [
          {
            method: "CASH",
            status: "SUCCEEDED",
            amount: 170000,
            cashierId: params.cashierId,
          },
        ],
      },
    },
    include: { items: true, tickets: true },
  });

  if (cashierPaid.tickets.length === 0 && cashierPaid.items[0]) {
    const usedTicket = await prisma.ticket.create({
      data: {
        orderId: cashierPaid.id,
        orderItemId: cashierPaid.items[0].id,
        sessionId: sessionA.id,
        ticketTypeId: params.adultTicketTypeId,
        status: "USED",
        usedAt: new Date(),
        qrToken: demoQr("cashier-used"),
      },
    });
    await prisma.ticketCheckIn.create({
      data: {
        ticketId: usedTicket.id,
        result: "SUCCESS",
        scannedById: params.cashierId,
      },
    });
    if (cashierPaid.items[1]) {
      await prisma.ticket.create({
        data: {
          orderId: cashierPaid.id,
          orderItemId: cashierPaid.items[1].id,
          sessionId: sessionA.id,
          ticketTypeId: params.childTicketTypeId,
          status: "VALID",
          qrToken: demoQr("cashier-child-valid"),
        },
      });
    }
  }

  // AWAITING_PAYMENT online
  await prisma.order.upsert({
    where: { number: demoOrderNumber("AWAIT01") },
    update: { status: "AWAITING_PAYMENT" },
    create: {
      number: demoOrderNumber("AWAIT01"),
      sessionId: sessionB.id,
      locationId: params.locationId,
      status: "AWAITING_PAYMENT",
      source: "ONLINE",
      customerName: "Ожидает Оплату",
      customerPhone: "+79007778899",
      customerEmail: "awaiting@example.com",
      totalAmount: 90000,
      paymentExpiresAt: new Date(Date.now() + 20 * 60 * 1000),
      items: {
        create: [
          {
            ticketTypeId: params.adultTicketTypeId,
            ticketTypeName: "Взрослый",
            quantity: 1,
            unitPriceAmount: 90000,
            subtotalAmount: 90000,
          },
        ],
      },
    },
  });

  // CANCELLED
  await prisma.order.upsert({
    where: { number: demoOrderNumber("CANCEL01") },
    update: { status: "CANCELLED" },
    create: {
      number: demoOrderNumber("CANCEL01"),
      sessionId: sessionB.id,
      locationId: params.locationId,
      status: "CANCELLED",
      source: "ONLINE",
      customerName: "Отменённый",
      customerPhone: "+79001231212",
      customerEmail: "cancelled@example.com",
      totalAmount: 80000,
      items: {
        create: [
          {
            ticketTypeId: params.childTicketTypeId,
            ticketTypeName: "Детский",
            quantity: 1,
            unitPriceAmount: 80000,
            subtotalAmount: 80000,
          },
        ],
      },
    },
  });

  // REFUNDED + refund row
  const refunded = await prisma.order.upsert({
    where: { number: demoOrderNumber("REFUND01") },
    update: { status: "REFUNDED" },
    create: {
      number: demoOrderNumber("REFUND01"),
      sessionId: sessionB.id,
      locationId: params.locationId,
      status: "REFUNDED",
      source: "ONLINE",
      customerName: "Возврат",
      customerPhone: "+79005556677",
      customerEmail: "refunded@example.com",
      totalAmount: 90000,
      items: {
        create: [
          {
            ticketTypeId: params.adultTicketTypeId,
            ticketTypeName: "Взрослый",
            quantity: 1,
            unitPriceAmount: 90000,
            subtotalAmount: 90000,
          },
        ],
      },
      payments: {
        create: [
          {
            method: "CARD_ONLINE",
            status: "REFUNDED",
            amount: 90000,
            provider: "yookassa",
            providerPaymentId: "seed-pay-refund-01",
          },
        ],
      },
    },
  });

  const existingRefund = await prisma.refund.findFirst({
    where: { orderId: refunded.id, status: "COMPLETED" },
  });
  if (!existingRefund) {
    await prisma.refund.create({
      data: {
        orderId: refunded.id,
        amount: 90000,
        status: "COMPLETED",
        reason: "Seed demo refund",
        actorId: params.cashierId,
      },
    });
  }
}

async function seedFaqAndGallery(locationId: string) {
  const faqs = [
    {
      id: "faq-visit-duration",
      question: "Сколько длится посещение?",
      answer: "Сеанс длится 20 минут.",
      sortOrder: 1,
    },
    {
      id: "faq-session-size",
      question: "Сколько человек бывает на одном сеансе?",
      answer: "Не более 15 гостей на сеанс.",
      sortOrder: 2,
    },
    {
      id: "faq-photo-interact",
      question: "Можно ли фотографировать и взаимодействовать с лемурами?",
      answer:
        "Личная съёмка разрешена. Соблюдайте рекомендации сотрудников. Правила взаимодействия с лемурами задаёт команда на сеансе.",
      sortOrder: 3,
    },
    {
      id: "faq-buy-ahead",
      question: "Можно ли купить билет на месте или лучше заранее?",
      answer:
        "Билет можно купить онлайн или в кассе перед сеансом. Мест на сеанс немного, надёжнее взять заранее.",
      sortOrder: 4,
    },
    {
      id: "faq-late",
      question: "Что делать, если я опоздал на сеанс?",
      answer: "Правило для опоздавших уточняйте у кассы или администратора.",
      sortOrder: 5,
    },
  ] as const;

  await prisma.faqItem.updateMany({ data: { isPublished: false } });

  for (const row of faqs) {
    await prisma.faqItem.upsert({
      where: { id: row.id },
      update: {
        question: row.question,
        answer: row.answer,
        sortOrder: row.sortOrder,
        isPublished: true,
      },
      create: {
        id: row.id,
        question: row.question,
        answer: row.answer,
        sortOrder: row.sortOrder,
        isPublished: true,
      },
    });
  }

  await prisma.galleryItem.upsert({
    where: { id: "gallery-demo-1" },
    update: { isPublished: false },
    create: {
      id: "gallery-demo-1",
      locationId,
      imageUrl: "/gallery/placeholder-1.jpg",
      altText: "Лемур в зоотеатре Лемурия Парк",
      sortOrder: 1,
      isPublished: false,
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "❌ Refusing to seed when NODE_ENV=production. Demo password ChangeMe123! must never ship to prod.",
    );
    process.exit(1);
  }

  console.log("🌱 Seeding database...");

  await seedSiteAndContactSettings();
  const { owner, cashier } = await seedUsers();
  const { adult, child, infant } = await seedTicketTypes();
  const location = await seedLocation();
  await seedLocationSchedule(location.id);
  await seedPriceRules(location.id, { adult: adult.id, child: child.id, infant: infant.id });
  await seedFaqAndGallery(location.id);
  const sessionsCreated = await seedSessions(location);
  await ensureTodayDemoSessions(location);
  await seedDemoCommerce({
    locationId: location.id,
    cashierId: cashier.id,
    adultTicketTypeId: adult.id,
    childTicketTypeId: child.id,
  });

  // Bind cashiers to the demo location for director staff views.
  for (const email of ["cashier@lemuriapark.ru", "cashier2@lemuriapark.ru", "owner@lemuriapark.ru"]) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    await prisma.userLocation.upsert({
      where: { userId_locationId: { userId: user.id, locationId: location.id } },
      update: {},
      create: { userId: user.id, locationId: location.id },
    });
  }

  console.log("✅ Seed complete:");
  console.log(`   Owner user:      ${owner.email} / ${DEMO_PASSWORD}`);
  console.log(`   Cashier user:    cashier@lemuriapark.ru / ${DEMO_PASSWORD}`);
  console.log(`   Disabled user:   disabled@lemuriapark.ru (cannot login)`);
  console.log(`   Location:        ${location.name} (${location.slug})`);
  console.log(`   Ticket types:    ${adult.name}, ${child.name}`);
  console.log(`   Sessions ready:  ${sessionsCreated}`);
  console.log("   Demo orders:     PAID online/cashier, AWAITING_PAYMENT, CANCELLED, REFUNDED");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
