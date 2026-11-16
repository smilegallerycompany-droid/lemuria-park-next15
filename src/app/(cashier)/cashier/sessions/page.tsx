"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import { getCashierSessions, type CashierSessionsResponse } from "@/lib/api/cashier";
import { useCurrentTime } from "@/components/cashier/use-current-time";

export default function CashierSessionsPage() {
  const [data, setData] = useState<CashierSessionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useCurrentTime();
  const upcomingSessions =
    data?.sessions.filter((session) => Date.parse(session.startsAt) > now) ?? [];

  useEffect(() => {
    let cancelled = false;
    async function load(attempt = 0) {
      try {
        const next = await getCashierSessions();
        if (!cancelled) setData(next);
      } catch (err) {
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 400));
          if (!cancelled) return load(attempt + 1);
        }
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : "Не удалось загрузить сеансы");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h1 className="cashier-page-title">Сеансы</h1>
      <p className="cashier-page-sub">
        Предстоящие сеансы на сегодня. Продажа — в{" "}
        <Link href="/cashier" style={{ textDecoration: "underline" }}>
          рабочем месте
        </Link>
        .
      </p>

      {error ? <p className="cashier-error">{error}</p> : null}
      {!data && !error ? <div className="cashier-loading">Загрузка…</div> : null}

      {data ? (
        <>
          <p className="cashier-page-sub">
            {data.location.city} · {data.location.venue} · {data.date}
          </p>
          <div className="cashier-orders-list">
            {upcomingSessions.map((session) => (
              <article key={session.publicId} className="cashier-order-row">
                <div className="cashier-order-head">
                  <span>{session.localTime}</span>
                  <span>
                    {session.sold}/{session.capacity}
                  </span>
                </div>
                <div style={{ color: "rgba(32,53,16,0.65)", fontSize: "0.9rem" }}>
                  Осталось: {session.remaining}
                  {session.soldOut ? " · SOLD OUT" : ""}
                </div>
              </article>
            ))}
            {upcomingSessions.length === 0 ? (
              <div className="cashier-empty">На сегодня больше нет предстоящих сеансов.</div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
