import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrderByNumber } from "@/server/services/orders";
import { toOrderDto } from "@/server/mappers/order";
import { formatMoneyFromKopecks } from "@/lib/utils";

interface PaymentPageProps {
  searchParams: Promise<{ order?: string }>;
}

/**
 * Honest payment-waiting state — production order status, awwwards visual.
 * No fake success while YooKassa is not connected.
 */
export default async function CheckoutPaymentPage({ searchParams }: PaymentPageProps) {
  const { order: orderNumber } = await searchParams;
  if (!orderNumber) redirect("/#booking");

  const order = await getOrderByNumber(orderNumber);
  if (!order) redirect("/#booking");

  const dto = await toOrderDto(order);
  if (dto.status === "PAID") redirect(`/success?order=${encodeURIComponent(dto.number)}`);

  const isExpired = dto.status === "EXPIRED" || dto.status === "CANCELLED";

  return (
    <main className="page-shell">
      <div className="container">
        <Link href="/">← На главную</Link>
        <h1 className="page-title">Ожидание оплаты</h1>

        <section className="success-card">
          <div className="success-top">
            <div className="success-badge" style={{ background: "var(--orange)", fontSize: 28 }}>
              …
            </div>
            <h1 style={{ margin: 0, fontSize: 42, letterSpacing: "-.055em" }}>
              {isExpired ? "Оплата недоступна" : "Заказ ожидает оплаты"}
            </h1>
            <p style={{ color: "var(--muted)", maxWidth: 560, margin: "12px auto 0" }}>
              {isExpired
                ? "Время ожидания оплаты истекло или заказ отменён. Оформите бронирование заново."
                : "ЮKassa ещё не подключена. Мы не показываем фальшивую успешную оплату. После webhook заказ станет PAID и откроется билет."}
            </p>
          </div>

          <div className="ticket">
            <div className="ticket-info">
              <h2>Заказ {dto.number}</h2>
              <div className="summary-list">
                <div className="summary-row">
                  <span>Статус</span>
                  <strong>{dto.status}</strong>
                </div>
                <div className="summary-row">
                  <span>Дата</span>
                  <strong>{dto.session.localDate}</strong>
                </div>
                <div className="summary-row">
                  <span>Сеанс</span>
                  <strong>{dto.session.localTime}</strong>
                </div>
                <div className="summary-row">
                  <span>Сумма</span>
                  <strong>{formatMoneyFromKopecks(dto.totalAmount)}</strong>
                </div>
                {dto.paymentExpiresAt && !isExpired && (
                  <div className="summary-row">
                    <span>Оплатить до</span>
                    <strong>{new Date(dto.paymentExpiresAt).toLocaleString("ru-RU")}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
                <Link className="button button-ghost" href="/#booking">
                  Выбрать другой сеанс
                </Link>
              </div>
            </div>
            <div className="qr">
              <div style={{ textAlign: "center", padding: 24 }}>
                <p style={{ fontSize: 18, fontWeight: 850 }}>Оплата не завершена</p>
                <p style={{ fontSize: 14, color: "var(--muted)" }}>
                  Билет и QR появятся только после статуса PAID
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
