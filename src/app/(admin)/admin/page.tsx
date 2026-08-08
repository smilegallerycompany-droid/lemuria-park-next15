"use client";

import { useEffect, useState } from "react";
import { directorFetch } from "@/lib/director/client";
import { KpiCard, PageHeader } from "@/components/internal";

type Dashboard = {
  locations: Record<string, number>;
  users: Record<string, number>;
  sales: Record<string, number>;
  payments: Record<string, number>;
  tickets: Record<string, number>;
  system: Record<string, string | number | null>;
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="director-card" style={{ padding: 16 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function AdminHomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    directorFetch<Dashboard>("/api/admin/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"));
  }, []);

  return (
    <div className="director-page">
      <PageHeader
        title="Администрирование"
        description="Операционный обзор платформы. Секреты не отображаются."
      />
      {error ? <p className="director-error">{error}</p> : null}
      {!data ? (
        <p>Загрузка…</p>
      ) : (
        <>
          <div className="director-kpi-grid">
            <KpiCard label="Локации ACTIVE" value={String(data.locations.ACTIVE ?? 0)} />
            <KpiCard label="PAID сегодня" value={String(data.sales.paidToday ?? 0)} />
            <KpiCard label="AWAITING" value={String(data.sales.awaitingPayment ?? 0)} />
            <KpiCard label="Ошибки 24ч" value={String(data.system.errors24h ?? 0)} tone="warning" />
          </div>

          <div className="director-grid-2" style={{ marginTop: 20 }}>
            <Block title="Локации">
              <ul className="director-plain-list">
                {Object.entries(data.locations).map(([k, v]) => (
                  <li key={k}>
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </li>
                ))}
              </ul>
            </Block>
            <Block title="Пользователи">
              <ul className="director-plain-list">
                {Object.entries(data.users).map(([k, v]) => (
                  <li key={k}>
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </li>
                ))}
              </ul>
            </Block>
            <Block title="Платежи">
              <ul className="director-plain-list">
                <li>
                  <span>Успешные сегодня</span>
                  <strong>{data.payments.succeededToday}</strong>
                </li>
                <li>
                  <span>Ожидают</span>
                  <strong>{data.payments.pending}</strong>
                </li>
                <li>
                  <span>Ошибки 24ч</span>
                  <strong>{data.payments.failed24h}</strong>
                </li>
              </ul>
            </Block>
            <Block title="Система">
              <ul className="director-plain-list">
                <li>
                  <span>Database</span>
                  <strong>{String(data.system.database)}</strong>
                </li>
                <li>
                  <span>ЮKassa</span>
                  <strong>{String(data.system.payment)}</strong>
                </li>
                <li>
                  <span>Email</span>
                  <strong>{String(data.system.email)}</strong>
                </li>
                <li>
                  <span>Shop ID</span>
                  <strong>{String(data.system.paymentShopIdMasked ?? "—")}</strong>
                </li>
              </ul>
            </Block>
          </div>
        </>
      )}
    </div>
  );
}
