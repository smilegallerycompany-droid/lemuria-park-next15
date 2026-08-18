import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { DomainError } from "@/server/domain/errors";
import {
  addCashOperation,
  closeCashierShift,
  computeShiftCashSummary,
  openCashierShift,
} from "@/server/services/cashier-shifts";

const prisma = new PrismaClient();

async function dbOk() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("cash IN/OUT, insufficient OUT, close difference, force close, closed immutability", async (t) => {
  if (!(await dbOk())) {
    t.skip("DATABASE_URL is not reachable");
    return;
  }

  const stamp = Date.now();
  const location = await prisma.location.create({
    data: {
      slug: `shift-ops-${stamp}`,
      name: "Shift Ops",
      city: "Test",
      address: "Addr",
      status: "PAUSED",
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `shift-ops-${stamp}@lemuria.test`,
      name: "Shift Ops Cashier",
      passwordHash: "x",
      role: "CASHIER",
      status: "ACTIVE",
    },
  });
  const director = await prisma.user.upsert({
    where: { email: "owner@lemuriapark.ru" },
    update: {},
    create: {
      email: "owner@lemuriapark.ru",
      name: "Owner",
      passwordHash: "x",
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  const opened = await openCashierShift({
    userId: user.id,
    locationId: location.id,
    openingCashAmount: 10_000,
    notes: "unit open",
  });

  await addCashOperation({
    userId: user.id,
    type: "IN",
    amount: 5_000,
    comment: "Размен",
  });
  let summary = await computeShiftCashSummary(opened.id);
  assert.equal(summary.currentCashBalance, 15_000);

  await addCashOperation({
    userId: user.id,
    type: "OUT",
    amount: 2_000,
    comment: "Инкассация",
  });
  summary = await computeShiftCashSummary(opened.id);
  assert.equal(summary.currentCashBalance, 13_000);

  await assert.rejects(
    () =>
      addCashOperation({
        userId: user.id,
        type: "OUT",
        amount: 50_000,
        comment: "too much",
      }),
    (err: unknown) => err instanceof DomainError && err.code === "INSUFFICIENT_CASH_BALANCE",
  );

  const other = await prisma.user.create({
    data: {
      email: `shift-ops-other-${stamp}@lemuria.test`,
      name: "Other Cashier",
      passwordHash: "x",
      role: "CASHIER",
      status: "ACTIVE",
    },
  });
  await assert.rejects(
    () =>
      closeCashierShift({
        userId: other.id,
        shiftId: opened.id,
        closingCashAmount: 13_000,
        notes: "чужая смена",
      }),
    (err: unknown) => err instanceof DomainError && err.code === "FORBIDDEN",
  );

  const admin = await prisma.user.create({
    data: {
      email: `shift-ops-admin-${stamp}@lemuria.test`,
      name: "Admin Override",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  const adminShift = await openCashierShift({
    userId: admin.id,
    locationId: location.id,
    openingCashAmount: 1_000,
    notes: "admin open",
  });
  const overdraft = await addCashOperation({
    userId: admin.id,
    type: "OUT",
    amount: 5_000,
    comment: "ADMIN override",
  });
  assert.ok(overdraft.currentCashBalance < 0);
  await closeCashierShift({
    userId: admin.id,
    shiftId: adminShift.id,
    closingCashAmount: 0,
    notes: "admin close after override",
  });

  const closed = await closeCashierShift({
    userId: user.id,
    shiftId: opened.id,
    closingCashAmount: 12_000,
    notes: "недостача unit",
  });
  assert.equal(closed.shift.status, "CLOSED");
  assert.equal(closed.shift.cashDifferenceAmount, -1_000);

  await assert.rejects(
    () =>
      addCashOperation({
        userId: user.id,
        type: "IN",
        amount: 100,
        comment: "after close",
      }),
    (err: unknown) => err instanceof DomainError && err.code === "SHIFT_NOT_OPEN",
  );

  await assert.rejects(
    () =>
      closeCashierShift({
        userId: user.id,
        shiftId: opened.id,
        closingCashAmount: 12_000,
        notes: "again",
      }),
    (err: unknown) => err instanceof DomainError && err.code === "SHIFT_ALREADY_CLOSED",
  );

  const second = await openCashierShift({
    userId: user.id,
    locationId: location.id,
    openingCashAmount: 1_000,
    notes: "second",
  });
  const forced = await closeCashierShift({
    userId: director.id,
    actorId: director.id,
    shiftId: second.id,
    closingCashAmount: 1_000,
    reason: "director force close unit",
    force: true,
  });
  assert.equal(forced.shift.status, "FORCE_CLOSED");
});
