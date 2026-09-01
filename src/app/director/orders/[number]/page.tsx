"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

type OrderTicket = {
  publicId: string;
  status: string;
  ticketType: { name: string };
  orderItem: { unitPriceAmount: number };
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
  tickets: OrderTicket[];
};

type Me = { role: string };

export default function DirectorOrderDetailPage() {
  const params = useParams<{ number: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allowUsed, setAllowUsed] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    directorFetch<Me>("/api/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

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
          setSelectedIds(
            data.order.tickets.filter((ticket) => ticket.status === "VALID").map((t) => t.publicId),
          );
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
    setSelectedIds(data.order.tickets.filter((ticket) => ticket.status === "VALID").map((t) => t.publicId));
  }

  const selectedTickets = useMemo(
    () => order?.tickets.filter((ticket) => selectedIds.includes(ticket.publicId)) ?? [],
    [order, selectedIds],
  );
  const refundAmount = selectedTickets.reduce((sum, ticket) => sum + ticket.orderItem.unitPriceAmount, 0);
  const isOwner = me?.role === "OWNER";

  function toggleTicket(publicId: string) {
    setSelectedIds((current) =>
      current.includes(publicId) ? current.filter((id) => id !== publicId) : [...current, publicId],
    );
  }

  async function refund() {
    if (!order || !confirmRefund || reason.trim().length < 3 || selectedIds.length === 0) return;
    setRefunding(true);
    setError(null);
    setMessage(null);
    try {
      const result = await directorFetch<{
        refund: { amount: number; status: string };
        orderStatus: string;
      }>(`/api/director/orders/${order.number}/refund`, {
        method: "POST",
        headers: { "Idempotency-Key": `ui-refund-${order.number}-${selectedIds.slice().sort().join("-")}` },
        body: JSON.stringify({
          confirm: true,
          reason: reason.trim(),
          ticketPublicIds: selectedIds,
          allowUsedTickets: allowUsed && isOwner,
        }),
      });
      setMessage(
        `Возврат ${formatMoneyFromKopecks(result.refund.amount)} оформлен. Заказ: ${result.orderStatus}. ЮKassa и фискализация не вызывались.`,
      );
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
      <PageHeader title={`Заказ ${order.number}`} description={`${order.status} · ${order.source}`} />
      {error ? <div className="director-alert error" role="alert">{error}</div> : null}
      {message ? (
        <div className="director-alert success" role="status" aria-live="polite">
          {message}
        </div>
      ) : null}

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
          <h2>Хронология</h2>
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
                <th>Кол-во</th>
                <th>Цена</th>
                <th>Сумма</th>
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
                <th>Цена</th>
              </tr>
            </thead>
            <tbody>
              {order.tickets.map((ticket) => (
                <tr key={ticket.publicId}>
                  <td>{ticket.publicId}</td>
                  <td>{ticket.ticketType.name}</td>
                  <td>{ticket.status}</td>
                  <td>{formatMoneyFromKopecks(ticket.orderItem.unitPriceAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {order.status === "PAID" ? (
        <section className="director-panel">
          <div className="director-panel-head">
            <h2>Возврат</h2>
          </div>
          <div style={{ padding: 18 }}>
            <p className="director-kpi-sub" style={{ marginTop: 0 }}>
              Выберите билеты. Сумма — целые копейки, не больше оплаченного. Повторный возврат того же
              билета невозможен. Использованный билет — только с политикой владельца. На staging ЮKassa не
              вызывается.
            </p>
            <fieldset className="director-field" style={{ border: 0, padding: 0 }}>
              <legend>Билеты к возврату</legend>
              {order.tickets.map((ticket) => {
                const usedBlocked = ticket.status === "USED" && !(allowUsed && isOwner);
                const alreadyGone = ticket.status === "REFUNDED" || ticket.status === "CANCELLED";
                const disabled = alreadyGone || usedBlocked;
                return (
                  <label key={ticket.publicId} className="director-check-row">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(ticket.publicId)}
                      disabled={disabled}
                      onChange={() => toggleTicket(ticket.publicId)}
                    />
                    <span>
                      {ticket.publicId} · {ticket.ticketType.name} · {ticket.status} ·{" "}
                      {formatMoneyFromKopecks(ticket.orderItem.unitPriceAmount)}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {isOwner ? (
              <label className="director-check-row">
                <input
                  type="checkbox"
                  checked={allowUsed}
                  onChange={(e) => setAllowUsed(e.target.checked)}
                />
                <span>Разрешить возврат использованных билетов (только владелец)</span>
              </label>
            ) : null}
            <p>
              К возврату: <strong>{formatMoneyFromKopecks(refundAmount)}</strong>
            </p>
            <div className="director-field">
              <label htmlFor="refund-reason">Причина</label>
              <textarea
                id="refund-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <ConfirmCheckbox
              checked={confirmRefund}
              onChange={setConfirmRefund}
              label="Подтверждаю возврат выбранных билетов. Действие попадёт в audit log."
            />
            <button
              type="button"
              className="director-btn danger"
              disabled={
                !confirmRefund || refunding || reason.trim().length < 3 || selectedIds.length === 0
              }
              onClick={() => void refund()}
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
