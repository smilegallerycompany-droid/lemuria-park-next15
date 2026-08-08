import { test, expect } from "@playwright/test";
import {
  cashierLogin,
  cashierSale,
  directorLogin,
  expectOk,
  findBookableSession,
  readJson,
} from "./helpers";

test.describe("Director schedule / sessions", () => {
  test("close empty session OK; refuse cancel/delete with PAID orders", async ({
    playwright,
    request,
  }) => {
    await directorLogin(request);

    const locations = await expectOk<{ locations: Array<{ id: string; slug?: string }> }>(
      await request.get("/api/director/locations"),
    );
    expect(locations.locations.length).toBeGreaterThan(0);

    const from = new Date().toISOString();
    const to = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();

    async function loadSessions(locationId: string, toIso = to) {
      return expectOk<{
        sessions: Array<{
          id: string;
          publicId: string;
          status: string;
          _count: { orders: number };
        }>;
      }>(
        await request.get(
          `/api/director/sessions?locationId=${locationId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(toIso)}`,
        ),
      );
    }

    // Prefer a location that already has an empty SCHEDULED slot (avoid fixture-only locs).
    let locationId = locations.locations[0]!.id;
    let sessions = await loadSessions(locationId);
    let empty = sessions.sessions.find(
      (s) => s.status === "SCHEDULED" && (s._count?.orders ?? 0) === 0,
    );
    if (!empty) {
      for (const loc of locations.locations.slice(1)) {
        const candidate = await loadSessions(loc.id);
        const found = candidate.sessions.find(
          (s) => s.status === "SCHEDULED" && (s._count?.orders ?? 0) === 0,
        );
        if (found) {
          locationId = loc.id;
          sessions = candidate;
          empty = found;
          break;
        }
      }
    }

    // Dense / empty fixture DBs — mint schedule slots then re-query.
    if (!empty) {
      const gen = await request.post("/api/director/sessions/generate", {
        data: { locationId, windowDays: 45 },
      });
      expect(gen.status()).toBe(200);
      const farTo = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
      sessions = await loadSessions(locationId, farTo);
      empty = sessions.sessions.find(
        (s) => s.status === "SCHEDULED" && (s._count?.orders ?? 0) === 0,
      );
    }
    expect(empty, "need an empty SCHEDULED session").toBeTruthy();

    const closeRes = await request.patch(`/api/director/sessions/${empty!.id}`, {
      data: { status: "CLOSED" },
    });
    const closed = await readJson<{ session: { status: string } }>(closeRes);
    expect(closeRes.status()).toBe(200);
    expect(closed.ok).toBe(true);
    if (!closed.ok) throw new Error("close failed");
    expect(closed.data.session.status).toBe("CLOSED");

    await request.patch(`/api/director/sessions/${empty!.id}`, {
      data: { status: "SCHEDULED" },
    });

    // Separate cookie jar for cashier so director session stays intact.
    const cashierCtx = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3001",
    });
    try {
      await cashierLogin(cashierCtx);
      const bookable = await findBookableSession(cashierCtx, 1);
      const { res: saleRes, body: saleBody } = await cashierSale(
        cashierCtx,
        bookable.publicId,
        1,
      );
      expect(saleRes.status()).toBe(201);
      expect(saleBody.ok).toBe(true);

      const paidSession = sessions.sessions.find((s) => s.publicId === bookable.publicId);
      expect(paidSession, "sold session must appear in director list window").toBeTruthy();

      const cancelRes = await request.patch(`/api/director/sessions/${paidSession!.id}`, {
        data: { status: "CANCELLED" },
      });
      const cancelBody = await readJson<unknown>(cancelRes);
      expect(cancelRes.status()).toBe(409);
      expect(cancelBody.ok).toBe(false);
      if (!cancelBody.ok) {
        expect(cancelBody.error.code).toBe("SESSION_HAS_PAID_ORDERS");
      }

      const delRes = await request.delete(`/api/director/sessions/${paidSession!.id}`);
      const delBody = await readJson<unknown>(delRes);
      expect(delRes.status()).toBe(409);
      expect(delBody.ok).toBe(false);
      if (!delBody.ok) {
        expect(delBody.error.code).toBe("SESSION_HAS_PAID_ORDERS");
      }
    } finally {
      await cashierCtx.dispose();
    }
  });
});
