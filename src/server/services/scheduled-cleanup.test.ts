import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runScheduledCleanup, type ScheduledCleanupDeps } from "./scheduled-cleanup";

function prismaClosed(): Error & { code: string } {
  const error = new Error("Server has closed the connection.") as Error & { code: string };
  error.code = "P1017";
  return error;
}

describe("runScheduledCleanup P1017 retry", () => {
  it("reconnects once and succeeds when the retry is idle-safe", async () => {
    let attempts = 0;
    let reconnects = 0;
    const deps: ScheduledCleanupDeps = {
      expireReservations: async () => {
        attempts += 1;
        if (attempts === 1) throw prismaClosed();
        return { expiredCount: 2 };
      },
      expireOrders: async () => ({ expiredCount: 1 }),
      recordOk: async () => undefined,
      recordError: async () => {
        throw new Error("recordError should not run on recovered cleanup");
      },
      reconnect: async () => {
        reconnects += 1;
      },
    };

    const result = await runScheduledCleanup(new Date(), deps);
    assert.deepEqual(result, { reservationsExpired: 2, ordersExpired: 1 });
    assert.equal(attempts, 2);
    assert.equal(reconnects, 1);
  });

  it("does not retry unrelated database errors", async () => {
    let reconnects = 0;
    let recorded = 0;
    const deps: ScheduledCleanupDeps = {
      expireReservations: async () => {
        throw Object.assign(new Error("table does not exist"), { code: "P2021" });
      },
      expireOrders: async () => ({ expiredCount: 0 }),
      recordOk: async () => undefined,
      recordError: async () => {
        recorded += 1;
      },
      reconnect: async () => {
        reconnects += 1;
      },
    };

    await assert.rejects(() => runScheduledCleanup(new Date(), deps), /table does not exist/);
    assert.equal(reconnects, 0);
    assert.equal(recorded, 1);
  });

  it("does not retry a second P1017 after reconnect", async () => {
    let reconnects = 0;
    const deps: ScheduledCleanupDeps = {
      expireReservations: async () => {
        throw prismaClosed();
      },
      expireOrders: async () => ({ expiredCount: 0 }),
      recordOk: async () => undefined,
      recordError: async () => undefined,
      reconnect: async () => {
        reconnects += 1;
      },
    };

    await assert.rejects(() => runScheduledCleanup(new Date(), deps), /Server has closed the connection/);
    assert.equal(reconnects, 1);
  });
});
