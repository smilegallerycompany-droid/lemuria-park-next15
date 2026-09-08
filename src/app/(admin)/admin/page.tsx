"use client";

import { useEffect, useState } from "react";
import { directorFetch } from "@/lib/director/client";
import { KpiCard, PageHeader } from "@/components/internal";
import { labelConfig, labelDashboardKey, labelStatus } from "@/lib/director/labels";

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
        title="Управление"
        description="Операционный обзор платформы. Секреты не показываются."
      />
      {error ? <p className="director-error">{error}</p> : null}
      {!data ? (
        <p>Загрузка…</p>
      ) : (
        <>
          <div className="director-kpi-grid">
            <KpiCard label="Активные локации" value={String(data.locations.ACTIVE ?? 0)} />
            <KpiCard label="Оплачено сегодня" value={String(data.sales.paidToday ?? 0)} />
            <KpiCard label="Ожидают оплаты" value={String(data.sales.awaitingPayment ?? 0)} />
            <KpiCard label="Ошибки за 24 ч" value={String(data.system.errors24h ?? 0)} tone="warning" />
          </div>

          <div className="director-grid-2" style={{ marginTop: 20 }}>
            <Block title="Локации">
              <ul className="director-kv-list">
                {Object.entries(data.locations).map(([k, v]) => (
                  <li key={k}>
                    <span>{labelStatus(k)}</span>
                    <strong>{v}</strong>
                  </li>
                ))}
              </ul>
            </Block>
            <Block title="Пользователи">
              <ul className="director-kv-list">
                {Object.entries(data.users).map(([k, v]) => (
                  <li key={k}>
                    <span>{labelDashboardKey(k)}</span>
                    <strong>{v}</strong>
                  </li>
                ))}
              </ul>
            </Block>
            <Block title="Платежи">
              <ul className="director-kv-list">
                <li>
                  <span>Успешные сегодня</span>
                  <strong>{data.payments.succeededToday}</strong>
                </li>
                <li>
                  <span>Ожидают</span>
                  <strong>{data.payments.pending}</strong>
                </li>
                <li>
                  <span>Ошибки за 24 ч</span>
                  <strong>{data.payments.failed24h}</strong>
                </li>
              </ul>
            </Block>
            <Block title="Система">
              <ul className="director-kv-list">
                <li>
                  <span>База данных</span>
                  <strong>{labelConfig(String(data.system.database ?? "—"))}</strong>
                </li>
                <li>
                  <span>ЮKassa</span>
                  <strong>{labelConfig(String(data.system.payment ?? "—"))}</strong>
                </li>
                <li>
                  <span>Почта</span>
                  <strong>{labelConfig(String(data.system.email ?? "—"))}</strong>
                </li>
                <li>
                  <span>Идентификатор магазина</span>
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
