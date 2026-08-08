/**
 * Create real staging Ticket records for physical QR acceptance (A–F).
 * Writes tokens under docs/qa-screenshots-rc2/staging-qr/ (gitignored).
 *
 * Requires APP_ENV=staging (or STAGING=1) and staging DATABASE_URL.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OUT = path.resolve("docs/qa-screenshots-rc2/staging-qr");

function token(label: string) {
  return `stg-qr-${label}-${randomBytes(10).toString("hex")}`;
}

function mkMoscow(daysFromToday: number, hour: number) {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);
  const base = new Date(Date.UTC(y, m - 1, day + daysFromToday, hour - 3, 0, 0));
  // hour in Moscow = UTC+3 → UTC hour = hour-3
  return base;
}

async function main() {
  if (process.env.APP_ENV !== "staging" && process.env.STAGING !== "1") {
    console.error("Refusing: set APP_ENV=staging (or STAGING=1) before creating fixtures.");
    process.exit(1);
  }

  const locations = await prisma.location.findMany({ orderBy: { createdAt: "asc" }, take: 2 });
  if (locations.length < 1) throw new Error("No locations — run seed first");

  const locA = locations[0]!;
  let locB = locations[1];
  if (!locB) {
    locB = await prisma.location.create({
      data: {
        slug: `staging-alt-${Date.now()}`,
        name: "Staging Alt Location",
        city: "Москва",
        address: "Staging only",
        timezone: "Europe/Moscow",
        status: "ACTIVE",
        defaultCapacity: 10,
      },
    });
  }

  const adult = await prisma.ticketType.findFirst({ where: { code: "ADULT" } });
  if (!adult) throw new Error("ADULT ticket type missing");

  const cashier = await prisma.user.findFirst({
    where: { email: "cashier@lemuriapark.ru", role: "CASHIER" },
  });
  if (!cashier) throw new Error("cashier user missing");

  await prisma.userLocation.deleteMany({ where: { userId: cashier.id } });
  await prisma.userLocation.create({
    data: { userId: cashier.id, locationId: locA.id },
  });

  async function ensureSession(locationId: string, startsAt: Date, capacity = 20) {
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
    return prisma.session.upsert({
      where: { locationId_startsAt: { locationId, startsAt } },
      create: { locationId, startsAt, endsAt, capacity, status: "SCHEDULED" },
      update: { status: "SCHEDULED", capacity },
    });
  }

  const sessionToday = await ensureSession(locA.id, mkMoscow(0, 15));
  const sessionWrongDate = await ensureSession(locA.id, mkMoscow(3, 15));
  const sessionOtherLoc = await ensureSession(locB.id, mkMoscow(0, 16));

  async function paidOrderWithTicket(opts: {
    label: string;
    sessionId: string;
    locationId: string;
    status: "VALID" | "USED" | "CANCELLED" | "REFUNDED";
  }) {
    const qrToken = token(opts.label);
    const number = `STG-${opts.label.toUpperCase()}-${randomBytes(3).toString("hex")}`;
    const orderStatus =
      opts.status === "REFUNDED"
        ? "REFUNDED"
        : opts.status === "CANCELLED"
          ? "CANCELLED"
          : "PAID";

    const order = await prisma.order.create({
      data: {
        number,
        status: orderStatus,
        source: "CASHIER",
        totalAmount: 100_000,
        currency: "RUB",
        customerName: `Fixture ${opts.label}`,
        customerPhone: "+79000000000",
        customerEmail: `fixture-${opts.label}@staging.local`,
        locationId: opts.locationId,
        sessionId: opts.sessionId,
        cashierId: cashier!.id,
        items: {
          create: [
            {
              ticketTypeId: adult!.id,
              ticketTypeName: adult!.name,
              quantity: 1,
              unitPriceAmount: 100_000,
              subtotalAmount: 100_000,
            },
          ],
        },
        payments: {
          create: [
            {
              provider: "cash",
              method: "CASH",
              status: "SUCCEEDED",
              amount: 100_000,
              currency: "RUB",
              cashierId: cashier!.id,
            },
          ],
        },
      },
      include: { items: true },
    });

    const item = order.items[0]!;
    const ticket = await prisma.ticket.create({
      data: {
        orderId: order.id,
        orderItemId: item.id,
        sessionId: opts.sessionId,
        ticketTypeId: adult!.id,
        qrToken,
        status: opts.status,
        usedAt: opts.status === "USED" ? new Date() : null,
      },
    });

    return { order, qrToken, ticket };
  }

  const A = await paidOrderWithTicket({
    label: "valid",
    sessionId: sessionToday.id,
    locationId: locA.id,
    status: "VALID",
  });
  const B = await paidOrderWithTicket({
    label: "used",
    sessionId: sessionToday.id,
    locationId: locA.id,
    status: "USED",
  });
  const C = await paidOrderWithTicket({
    label: "wrongdate",
    sessionId: sessionWrongDate.id,
    locationId: locA.id,
    status: "VALID",
  });
  const D = await paidOrderWithTicket({
    label: "wrongloc",
    sessionId: sessionOtherLoc.id,
    locationId: locB.id,
    status: "VALID",
  });
  const E = await paidOrderWithTicket({
    label: "cancelled",
    sessionId: sessionToday.id,
    locationId: locA.id,
    status: "CANCELLED",
  });
  const F = await paidOrderWithTicket({
    label: "refunded",
    sessionId: sessionToday.id,
    locationId: locA.id,
    status: "REFUNDED",
  });

  fs.mkdirSync(OUT, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    cashierEmail: "cashier@lemuriapark.ru",
    cashierPasswordHint: "staging seed demo password — ChangeMe123! (staging DB only)",
    cashierAllowedLocation: { id: locA.id, name: locA.name, slug: locA.slug },
    otherLocation: { id: locB.id, name: locB.name, slug: locB.slug },
    note:
      "REFUNDED tickets return check-in result CANCELLED (same server path). Tokens are real Ticket.qrToken values.",
    fixtures: {
      A_VALID: { qrToken: A.qrToken, orderNumber: A.order.number, ticketPublicId: A.ticket.publicId },
      B_USED: { qrToken: B.qrToken, orderNumber: B.order.number, ticketPublicId: B.ticket.publicId },
      C_WRONG_DATE: {
        qrToken: C.qrToken,
        orderNumber: C.order.number,
        ticketPublicId: C.ticket.publicId,
      },
      D_WRONG_LOCATION: {
        qrToken: D.qrToken,
        orderNumber: D.order.number,
        ticketPublicId: D.ticket.publicId,
      },
      E_CANCELLED: {
        qrToken: E.qrToken,
        orderNumber: E.order.number,
        ticketPublicId: E.ticket.publicId,
      },
      F_REFUNDED: {
        qrToken: F.qrToken,
        orderNumber: F.order.number,
        ticketPublicId: F.ticket.publicId,
      },
    },
  };

  fs.writeFileSync(path.join(OUT, "fixtures.json"), JSON.stringify(manifest, null, 2));
  for (const [key, value] of Object.entries(manifest.fixtures)) {
    fs.writeFileSync(path.join(OUT, `${key}.txt`), `${value.qrToken}\n`);
  }

  console.log(JSON.stringify(manifest, null, 2));
  console.log("\nWrote", OUT);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
