import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrderByNumber } from "@/server/services/orders";
import { toOrderDto } from "@/server/mappers/order";
import { issueTicketsForOrder } from "@/server/services/tickets";
import { formatMoneyFromKopecks } from "@/lib/utils";

interface SuccessPageProps {
  searchParams: Promise<{ order?: string }>;
}

/**
 * Success only for real PAID orders. Tickets issued server-side if missing.
 */
export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const { order: orderNumber } = await searchParams;
  if (!orderNumber) redirect("/#booking");

  const order = await getOrderByNumber(orderNumber);
  if (!order) redirect("/#booking");

  if (order.status === "AWAITING_PAYMENT" || order.status === "DRAFT") {
    redirect(`/checkout/payment?order=${encodeURIComponent(orderNumber)}`);
  }

  if (order.status === "EXPIRED" || order.status === "CANCELLED") {
    const dto = await toOrderDto(order, { ensurePayment: false });
    return (
      <main className="page-shell">
        <div className="container">
          <section className="success-card">
            <div className="success-top">
              <div className="success-badge" style={{ background: "var(--orange-deep)" }}>
                !
              </div>
              <h1 style={{ margin: 0, fontSize: 42, letterSpacing: "-.055em" }}>
                {order.status === "EXPIRED" ? "Время оплаты истекло" : "Заказ отменён"}
              </h1>
              <p style={{ color: "var(--muted)" }}>
                Заказ № {dto.number} больше не действителен. Оформите бронирование заново.
              </p>
              <Link className="button button-orange" href="/#booking" style={{ marginTop: 24 }}>
                К билетам
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (order.status !== "PAID") {
    redirect(`/checkout/payment?order=${encodeURIComponent(orderNumber)}`);
  }

  await issueTicketsForOrder(order.id);
  const dto = await toOrderDto(order, { ensurePayment: false });

  return (
    <main className="page-shell">
      <div className="container">
        <section className="success-card">
          <div className="success-top">
            <div className="success-badge">✓</div>
            <h1 style={{ margin: 0, fontSize: 52, letterSpacing: "-.055em" }}>
              Оплата прошла успешно
            </h1>
            <p style={{ color: "var(--muted)" }}>
              Заказ оплачен. Покажите QR-код (или токен) на входе.
            </p>
          </div>

          <div className="ticket">
            <div className="ticket-info">
              <h2>Электронный билет</h2>
              <div className="summary-list">
                <div className="summary-row">
                  <span>Номер заказа</span>
                  <strong>№ {dto.number}</strong>
                </div>
                <div className="summary-row">
                  <span>Покупатель</span>
                  <strong>{dto.customerName}</strong>
                </div>
                <div className="summary-row">
                  <span>Дата посещения</span>
                  <strong>{dto.session.localDate}</strong>
                </div>
                <div className="summary-row">
                  <span>Время сеанса</span>
                  <strong>{dto.session.localTime}</strong>
                </div>
                <div className="summary-row">
                  <span>Билеты</span>
                  <strong>
                    {dto.items.map((i) => `${i.quantity} ${i.ticketTypeName}`).join(" · ")}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Оплачено</span>
                  <strong>{formatMoneyFromKopecks(dto.totalAmount)}</strong>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
                <Link className="button button-ghost" href="/">
                  На главную
                </Link>
              </div>
            </div>
            <div className="qr" style={{ alignContent: "start", padding: 24, gap: 16 }}>
              {dto.tickets.length === 0 ? (
                <p style={{ fontSize: 15 }}>Билеты выпускаются… обновите страницу</p>
              ) : (
                dto.tickets.map((ticket, index) => (
                  <div
                    key={ticket.publicId}
                    style={{
                      width: "100%",
                      border: "1px dashed #ccd9c3",
                      borderRadius: 16,
                      padding: 16,
                      textAlign: "left",
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 850 }}>Билет {index + 1}</p>
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
                      {ticket.publicId}
                    </p>
                    <p
                      style={{
                        margin: "12px 0 0",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 13,
                        wordBreak: "break-all",
                        fontWeight: 700,
                      }}
                    >
                      {ticket.qrToken}
                    </p>
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
                      Статус: {ticket.status}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
