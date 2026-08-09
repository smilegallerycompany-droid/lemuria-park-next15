"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/internal";
import { OrderTimeline } from "@/components/director/OrderTimeline";
import { directorFetch } from "@/lib/director/client";
import { labelPaymentMethod, labelStatus } from "@/lib/director/labels";

type PaymentDetail = {
  id: string;
  orderNumber: string;
  provider: string | null;
  amount: number;
  status: string;
  method: string;
  providerPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
  succeededAt: string | null;
  refundedAmount: number;
  tickets: Array<{ publicId: string; status: string; ticketType: { name: string } }>;
  webhookEvents: Array<{ id: string; action: string; createdAt: string }>;
  order: { number: string; status: string; source: string };
};

export default function AdminPaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [timeline, setTimeline] = useState<
    Array<{ type: string; at: string; title: string; detail?: string | null }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    directorFetch<{ payment: PaymentDetail; timeline: typeof timeline }>(
      `/api/admin/payments/${params.id}`,
    )
      .then((d) => {
        setPayment(d.payment);
        setTimeline(d.timeline ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, [params.id]);

  if (!payment && !error) return <div className="director-empty">Загрузка…</div>;

  return (
    <div className="director-page">
      <PageHeader
        title="Payment detail"
        description="Без secrets / PAN / auth headers"
        actions={
          <Link href="/admin/payments" className="internal-btn secondary">
            К списку
          </Link>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}
      {payment ? (
        <>
          <ul className="director-plain-list">
            <li>
              <span>Order</span>
              <strong>
                <Link href={`/director/orders/${payment.orderNumber}`}>{payment.orderNumber}</Link>
              </strong>
            </li>
            <li>
              <span>Provider</span>
              <strong>{payment.provider ?? "—"}</strong>
            </li>
            <li>
              <span>Amount</span>
              <strong>{(payment.amount / 100).toLocaleString("ru-RU")} ₽</strong>
            </li>
            <li>
              <span>Status</span>
              <strong>{labelStatus(payment.status)}</strong>
            </li>
            <li>
              <span>Method</span>
              <strong>{labelPaymentMethod(payment.method)}</strong>
            </li>
            <li>
              <span>Provider payment id</span>
              <strong>{payment.providerPaymentId ?? "—"}</strong>
            </li>
            <li>
              <span>Created</span>
              <strong>{new Date(payment.createdAt).toLocaleString("ru-RU")}</strong>
            </li>
            <li>
              <span>Updated</span>
              <strong>{new Date(payment.updatedAt).toLocaleString("ru-RU")}</strong>
            </li>
            <li>
              <span>Succeeded at</span>
              <strong>
                {payment.succeededAt
                  ? new Date(payment.succeededAt).toLocaleString("ru-RU")
                  : "—"}
              </strong>
            </li>
            <li>
              <span>Refunded</span>
              <strong>{(payment.refundedAmount / 100).toLocaleString("ru-RU")} ₽</strong>
            </li>
          </ul>

          <section className="director-panel" style={{ marginTop: 18 }}>
            <div className="director-panel-head">
              <h2>Related tickets</h2>
            </div>
            <ul className="director-plain-list">
              {payment.tickets.map((t) => (
                <li key={t.publicId}>
                  <span>{t.ticketType.name}</span>
                  <strong>
                    {t.publicId} · {t.status}
                  </strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="director-panel" style={{ marginTop: 18 }}>
            <div className="director-panel-head">
              <h2>Webhook / audit events</h2>
            </div>
            <ul className="director-plain-list">
              {payment.webhookEvents.length === 0 ? (
                <li>
                  <span>Нет webhook-событий</span>
                  <strong>—</strong>
                </li>
              ) : (
                payment.webhookEvents.map((w) => (
                  <li key={w.id}>
                    <span>{new Date(w.createdAt).toLocaleString("ru-RU")}</span>
                    <strong>{w.action}</strong>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="director-panel" style={{ marginTop: 18 }}>
            <div className="director-panel-head">
              <h2>Order timeline</h2>
            </div>
            <div style={{ padding: 18 }}>
              <OrderTimeline events={timeline} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
