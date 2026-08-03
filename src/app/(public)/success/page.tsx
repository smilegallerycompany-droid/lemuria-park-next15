import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrderByNumber } from "@/server/services/orders";
import { toOrderDto } from "@/server/mappers/order";
import { formatMoneyFromKopecks } from "@/lib/utils";

interface SuccessPageProps {
  searchParams: Promise<{ order?: string }>;
}

/**
 * Success only for real PAID orders (production status check).
 * Awwwards ticket card visual — no fabricated QR until tickets exist.
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
    const dto = await toOrderDto(order);
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

  const dto = await toOrderDto(order);

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
              Заказ оплачен. QR-билеты будут показаны здесь после выпуска (отдельный этап).
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
            <div className="qr">
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 100, lineHeight: 1 }}>▦</div>
                <p style={{ fontSize: 15 }}>QR появится после выпуска билетов</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
