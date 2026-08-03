"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createPublicOrder, getPublicReservationWithMeta } from "@/lib/api/public";
import { ApiClientError } from "@/lib/api/client";
import { createIdempotencyKey, formatMoneyFromKopecks } from "@/lib/utils";
import type { PublicReservationDto } from "@/types/dto/reservation";

/**
 * Awwwards checkout visual + production reservation→order API.
 */
function CheckoutInner() {
  const router = useRouter();
  const search = useSearchParams();
  const reservationId = search.get("reservation") ?? "";

  const [reservation, setReservation] = useState<PublicReservationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!reservationId) {
      setError("Резерв не найден. Вернитесь к выбору билетов.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, meta } = await getPublicReservationWithMeta(reservationId);
        if (cancelled) return;
        if (data.status === "EXPIRED") {
          setError("Время резерва истекло. Выберите сеанс заново.");
          setReservation(data);
          return;
        }
        setReservation(data);
        const serverNow = meta.serverDate?.getTime() ?? Date.now();
        const expires = new Date(data.expiresAt).getTime();
        setRemainingSec(Math.max(0, Math.floor((expires - serverNow) / 1000)));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiClientError ? e.message : "Не удалось загрузить резерв");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reservationId]);

  useEffect(() => {
    if (remainingSec === null) return;
    if (remainingSec <= 0) {
      setError("Время резерва истекло. Выберите сеанс заново.");
      return;
    }
    const t = window.setTimeout(() => setRemainingSec((s) => (s === null ? s : s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [remainingSec]);

  const timerLabel = useMemo(() => {
    if (remainingSec === null) return "—";
    const m = Math.floor(remainingSec / 60);
    const s = remainingSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [remainingSec]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reservation || !consent || remainingSec === null || remainingSec <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await createPublicOrder(
        {
          reservationPublicId: reservation.publicId,
          customerName: `${firstName.trim()} ${lastName.trim()}`.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim(),
        },
        createIdempotencyKey(),
      );
      router.push(`/checkout/payment?order=${encodeURIComponent(order.number)}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Не удалось создать заказ");
      setSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="container">
        <Link href="/#booking">← Вернуться к билетам</Link>
        <h1 className="page-title">Оформление заказа</h1>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Загрузка…</p>
        ) : (
          <section className="checkout-grid">
            <aside className="order-pane">
              <h2>Ваш заказ</h2>
              {reservation ? (
                <>
                  <div className="summary-list">
                    <div className="summary-row">
                      <span>Дата посещения</span>
                      <strong>{reservation.session.localDate}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Сеанс</span>
                      <strong>{reservation.session.localTime}</strong>
                    </div>
                    {reservation.items.map((item) => (
                      <div className="summary-row" key={item.ticketTypeCode}>
                        <span>{item.ticketTypeName}</span>
                        <strong>
                          {item.quantity} × {formatMoneyFromKopecks(item.unitPrice)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="total">
                    <span>Итого</span>
                    <strong>{formatMoneyFromKopecks(reservation.totalAmount)}</strong>
                  </div>
                  <p style={{ marginTop: 16, color: "var(--orange-deep)", fontWeight: 800 }}>
                    Резерв: {timerLabel}
                  </p>
                </>
              ) : (
                <p style={{ color: "var(--muted)" }}>Нет данных резерва</p>
              )}
            </aside>

            <div className="form-pane">
              <h2>Данные покупателя</h2>
              <form className="form-grid" onSubmit={(e) => void onSubmit(e)}>
                <div className="field-group">
                  <label htmlFor="firstName">Имя</label>
                  <input
                    id="firstName"
                    className="input"
                    placeholder="Введите имя"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="lastName">Фамилия</label>
                  <input
                    id="lastName"
                    className="input"
                    placeholder="Введите фамилию"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
                <div className="field-group span-2">
                  <label htmlFor="phone">Телефон</label>
                  <input
                    id="phone"
                    className="input"
                    placeholder="+7 (___) ___-__-__"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="field-group span-2">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    className="input"
                    placeholder="name@example.ru"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <label
                  className="span-2"
                  style={{ display: "flex", gap: 10, color: "var(--muted)" }}
                >
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    required
                  />
                  Согласен с правилами посещения и обработкой персональных данных
                </label>
                {error && (
                  <p className="span-2" style={{ color: "var(--orange-deep)" }}>
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  className="button button-orange span-2"
                  disabled={
                    submitting ||
                    !reservation ||
                    !consent ||
                    remainingSec === null ||
                    remainingSec <= 0
                  }
                >
                  {submitting
                    ? "Создаём заказ…"
                    : `Перейти к оплате · ${reservation ? formatMoneyFromKopecks(reservation.totalAmount) : ""}`}
                </button>
              </form>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="page-shell">
          <div className="container">Загрузка…</div>
        </main>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
