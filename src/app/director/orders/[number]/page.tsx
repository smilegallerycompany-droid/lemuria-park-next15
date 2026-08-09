"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { ConfirmCheckbox } from "@/components/director/ConfirmCheckbox";
import { OrderTimeline } from "@/components/director/OrderTimeline";
import { directorFetch, formatDateTime } from "@/lib/director/client";
import { formatMoneyFromKopecks } from "@/lib/utils";

type TimelineEvent = {
  type: string;
  at: string;
  title: string;
  detail?: string | null;
};

type OrderDetail = {
  number: string;
  status: string;
  source: string;
  totalAmount: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  createdAt: string;
  location: { name: string };
  session: { startsAt: string; endsAt: string };
  items: Array<{
    ticketTypeName: string;
    quantity: number;
    unitPriceAmount: number;
    subtotalAmount: number;
  }>;
  payments: Array<{ method: string; status: string; amount: number }>;
  refunds: Array<{ amount: number; status: string; reason: string | null; createdAt: string }>;
  tickets: Array<{ publicId: string; status: string; ticketType: { name: string } }>;
};

export default function DirectorOrderDetailPage() {
  const params = useParams<{ number: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [reason, setReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await directorFetch<{ order: OrderDetail; timeline: TimelineEvent[] }>(
          `/api/director/orders/${params.number}`,
        );
        if (!cancelled) {
          setOrder(data.order);
          setTimeline(data.timeline ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.number]);

  async function load() {
    const data = await directorFetch<{ order: OrderDetail; timeline: TimelineEvent[] }>(
      `/api/director/orders/${params.number}`,
    );
    setOrder(data.order);
    setTimeline(data.timeline ?? []);
  }

  async function refund() {
    if (!order || !confirmRefund || reason.trim().length < 3) return;
    setRefunding(true);
    setError(null);
    setMessage(null);
    try {
      await directorFetch(`/api/director/orders/${order.number}/refund`, {
        method: "POST",
        body: JSON.stringify({ confirm: true, reason: reason.trim() }),
      });
      setMessage("Возврат оформлен (manual refund + audit).");
      setConfirmRefund(false);
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось оформить возврат");
    } finally {
      setRefunding(false);
    }
  }

  if (!order && !error) return <div className="director-empty">Загрузка…</div>;
  if (!order) return <div className="director-alert error">{error}</div>;

  return (
    <>
      <PageHeader title={`Order ${order.number}`} description={`${order.status} · ${order.source}`} />
      {error ? <div className="director-alert error">{error}</div> : null}
      {message ? <div className="director-alert success">{message}</div> : null}

      <div className="director-card-grid">
        <div className="director-kpi">
          <div className="director-kpi-label">Сумма</div>
          <div className="director-kpi-value accent-green">{formatMoneyFromKopecks(order.totalAmount)}</div>
        </div>
        <div className="director-kpi">
          <div className="director-kpi-label">Клиент</div>
          <div className="director-kpi-value" style={{ fontSize: 18 }}>
            {order.customerName}
          </div>
          <div className="director-kpi-sub">
            {order.customerPhone} · {order.customerEmail}
          </div>
        </div>
        <div className="director-kpi">
          <div className="director-kpi-label">Сеанс</div>
          <div className="director-kpi-value" style={{ fontSize: 18 }}>
            {formatDateTime(order.session.startsAt)}
          </div>
          <div className="director-kpi-sub">{order.location.name}</div>
        </div>
      </div>

      <section className="director-panel" style={{ marginBottom: 18 }}>
        <div className="director-panel-head">
          <h2>Timeline</h2>
        </div>
        <div style={{ padding: 18 }}>
          <OrderTimeline events={timeline} />
        </div>
      </section>

      <section className="director-panel" style={{ marginBottom: 18 }}>
        <div className="director-panel-head">
          <h2>Позиции</h2>
        </div>
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={`${item.ticketTypeName}-${index}`}>
                  <td>{item.ticketTypeName}</td>
                  <td>{item.quantity}</td>
                  <td>{formatMoneyFromKopecks(item.unitPriceAmount)}</td>
                  <td>{formatMoneyFromKopecks(item.subtotalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="director-panel" style={{ marginBottom: 18 }}>
        <div className="director-panel-head">
          <h2>Билеты</h2>
        </div>
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Public ID</th>
                <th>Тип</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {order.tickets.map((ticket) => (
                <tr key={ticket.publicId}>
                  <td>{ticket.publicId}</td>
                  <td>{ticket.ticketType.name}</td>
                  <td>{ticket.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {order.status === "PAID" ? (
        <section className="director-panel">
          <div className="director-panel-head">
            <h2>Manual refund</h2>
          </div>
          <div style={{ padding: 18 }}>
            <div className="director-field">
              <label>Причина</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <ConfirmCheckbox
              checked={confirmRefund}
              onChange={setConfirmRefund}
              label="Подтверждаю ручной возврат оплаченного заказа (действие попадёт в audit log)."
            />
            <button
              type="button"
              className="director-btn danger"
              disabled={!confirmRefund || refunding || reason.trim().length < 3}
              onClick={refund}
            >
              {refunding ? "Оформление…" : "Оформить возврат"}
            </button>
          </div>
        </section>
      ) : null}

      {order.refunds.length > 0 ? (
        <section className="director-panel" style={{ marginTop: 18 }}>
          <div className="director-panel-head">
            <h2>Возвраты</h2>
          </div>
          <div className="director-table-wrap">
            <table className="director-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Причина</th>
                </tr>
              </thead>
              <tbody>
                {order.refunds.map((refundRow, index) => (
                  <tr key={`${refundRow.createdAt}-${index}`}>
                    <td>{formatDateTime(refundRow.createdAt)}</td>
                    <td>{formatMoneyFromKopecks(refundRow.amount)}</td>
                    <td>{refundRow.status}</td>
                    <td>{refundRow.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
