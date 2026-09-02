"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import { getCashierSessions, type CashierSessionsResponse } from "@/lib/api/cashier";

export default function CashierSessionsPage() {
  const [data, setData] = useState<CashierSessionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        Сегодняшние сеансы. Продажа — в{" "}
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
            {data.sessions.map((session) => (
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
            {data.sessions.length === 0 ? (
              <div className="cashier-empty">На сегодня сеансов нет</div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
