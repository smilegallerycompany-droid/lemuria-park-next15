import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

export const OWNER = {
  email: "owner@lemuriapark.ru",
  password: "ChangeMe123!",
};

export const CASHIER = {
  email: "cashier@lemuriapark.ru",
  password: "ChangeMe123!",
};

export const DISABLED_USER = {
  email: "disabled@lemuriapark.ru",
  password: "ChangeMe123!",
};

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export async function readJson<T>(res: APIResponse): Promise<ApiEnvelope<T>> {
  return (await res.json()) as ApiEnvelope<T>;
}

export async function expectOk<T>(res: APIResponse): Promise<T> {
  const body = await readJson<T>(res);
  expect(body.ok, JSON.stringify(body)).toBe(true);
  if (!body.ok) throw new Error("unreachable");
  return body.data;
}

/** Moscow local calendar date (YYYY-MM-DD) for booking queries. */
export function moscowToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function findBookableSession(
  request: APIRequestContext,
  minSeats = 1,
  opts?: { preferToday?: boolean },
): Promise<{ publicId: string; available: number; localDate: string }> {
  const preferToday = opts?.preferToday !== false;
  const start = moscowToday();

  for (let offset = 0; offset < 14; offset += 1) {
    if (!preferToday && offset === 0) continue;
    const anchor = new Date(`${start}T12:00:00+03:00`);
    anchor.setUTCDate(anchor.getUTCDate() + offset);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(anchor);

    const res = await request.get(
      `/api/public/sessions?locationSlug=moscow-vdnh&date=${encodeURIComponent(date)}`,
    );
    const data = await expectOk<{
      sessions: Array<{
        publicId: string;
        localDate: string;
        startsAt?: string;
        remainingSeats?: number;
        available?: number;
      }>;
    }>(res);

    const now = Date.now();
    const session = data.sessions.find((s) => {
      const seats = s.remainingSeats ?? s.available ?? 0;
      if (seats < minSeats) return false;
      // Skip sessions that already started (listing may still show them).
      if (s.startsAt && Date.parse(s.startsAt) <= now) return false;
      return true;
    });
    if (session) {
      return {
        publicId: session.publicId,
        localDate: session.localDate,
        available: session.remainingSeats ?? session.available ?? 0,
      };
    }
  }

  throw new Error(`No bookable session in next 14 days with >= ${minSeats} seats`);
}

export async function createOnlineOrder(
  request: APIRequestContext,
  opts?: { quantity?: number; sessionPublicId?: string },
) {
  const quantity = opts?.quantity ?? 1;
  const session =
    opts?.sessionPublicId != null
      ? { publicId: opts.sessionPublicId }
      : await findBookableSession(request, quantity);

  const resHold = await request.post("/api/public/reservations", {
    data: {
      sessionPublicId: session.publicId,
      items: [{ ticketTypeCode: "ADULT", quantity }],
    },
    headers: { "Idempotency-Key": `e2e-res-${crypto.randomUUID()}` },
  });
  const reservation = await expectOk<{ publicId: string }>(resHold);

  const resOrder = await request.post("/api/public/orders", {
    data: {
      reservationPublicId: reservation.publicId,
      customerName: "E2E Guest",
      customerPhone: "+79001234567",
      customerEmail: "e2e-guest@example.com",
    },
    headers: { "Idempotency-Key": `e2e-ord-${crypto.randomUUID()}` },
  });
  return expectOk<{
    number: string;
    status: string;
    paymentConfigured: boolean;
    paymentStatus: string | null;
    items: Array<{ unitPrice: number; quantity: number }>;
    tickets: Array<{ publicId: string; qrToken: string; status: string }>;
  }>(resOrder);
}

export async function cashierLogin(request: APIRequestContext) {
  const res = await request.post("/api/cashier/login", {
    data: CASHIER,
  });
  expect(res.status()).toBe(200);
  return expectOk<{ id: string; email: string; role: string }>(res);
}

export async function directorLogin(request: APIRequestContext) {
  const res = await request.post("/api/auth/login", {
    data: { ...OWNER, portal: "director" },
  });
  expect(res.status()).toBe(200);
  return expectOk<{ id: string; email: string; role: string }>(res);
}

export async function cashierSale(
  request: APIRequestContext,
  sessionPublicId: string,
  quantity = 1,
  idempotencyKey?: string,
) {
  const res = await request.post("/api/cashier/sales", {
    data: {
      sessionPublicId,
      items: [{ ticketTypeCode: "ADULT", quantity }],
      paymentMethod: "CASH",
      customerName: "Касса E2E",
    },
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });
  return { res, body: await readJson<{
    number: string;
    status: string;
    totalAmount: number;
  }>(res) };
}
