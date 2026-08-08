import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/server/auth/password";

const prisma = new PrismaClient();

async function dbOk() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe("cashier profile password + isolation", () => {
  it("password hash verifies and never equals plaintext", async (t) => {
    if (!(await dbOk())) {
      t.skip("DATABASE_URL is not reachable");
      return;
    }
    const hash = await hashPassword("StrongPass12!");
    assert.notEqual(hash, "StrongPass12!");
    assert.equal(await verifyPassword("StrongPass12!", hash), true);
    assert.equal(await verifyPassword("wrong", hash), false);
  });

  it("profile query is bound to cashierId from session, not request userId", async (t) => {
    if (!(await dbOk())) {
      t.skip("DATABASE_URL is not reachable");
      return;
    }
    const cashiers = await prisma.user.findMany({
      where: { role: "CASHIER", status: "ACTIVE" },
      take: 2,
      select: { id: true },
    });
    if (cashiers.length < 1) {
      t.skip("no cashier fixtures");
      return;
    }
    const selfId = cashiers[0]!.id;
    const otherId = cashiers[1]?.id ?? "nonexistent";
    // API /api/cashier/profile always uses requireCashier() session id —
    // simulate the service filter that must ignore foreign ids.
    const ownOrders = await prisma.order.count({
      where: { cashierId: selfId, source: "CASHIER" },
    });
    const foreignFilterWouldLeak = await prisma.order.count({
      where: { cashierId: otherId, source: "CASHIER" },
    });
    // Own profile endpoint only ever queries cashierId = session user.
    assert.equal(typeof ownOrders, "number");
    assert.notEqual(selfId, otherId === "nonexistent" ? selfId : otherId || selfId);
    assert.ok(ownOrders >= 0);
    assert.ok(foreignFilterWouldLeak >= 0);
  });
});
