"use client";

import {
  CalendarDays,
  Clock3,
  Gift,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicReservation,
  getPublicConfig,
  getPublicSessions,
} from "@/lib/api/public";
import { ApiClientError } from "@/lib/api/client";
import { createIdempotencyKey, formatMoneyFromKopecks } from "@/lib/utils";
import type { PublicConfigDto } from "@/types/dto/config";
import type { PublicSessionDto } from "@/types/dto/session";

type QtyMap = Record<string, number>;

function monthLabel(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, monthIndex, 1)),
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function parseDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, monthIndex: m - 1, day: d };
}

export function BookingAwwwards() {
  const [config, setConfig] = useState<PublicConfigDto | null>(null);
  const [sessions, setSessions] = useState<PublicSessionDto[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [qty, setQty] = useState<QtyMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingConfig(true);
        const cfg = await getPublicConfig();
        if (cancelled) return;
        setConfig(cfg);
        setSelectedDate(cfg.availableDateRange.from);
        const initial: QtyMap = {};
        for (const t of cfg.ticketTypes) {
          if (t.code === "ADULT") initial[t.code] = 2;
          else if (t.code === "CHILD") initial[t.code] = 1;
          else initial[t.code] = 0;
        }
        setQty(initial);
        const from = parseDateKey(cfg.availableDateRange.from);
        setViewMonth({ year: from.year, monthIndex: from.monthIndex });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiClientError ? e.message : "Не удалось загрузить конфигурацию");
        }
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSessions = useCallback(async (date: string, locationSlug?: string) => {
    setLoadingSessions(true);
    setError(null);
    try {
      const data = await getPublicSessions({ date, locationSlug });
      setSessions(data.sessions);
      const firstOpen = data.sessions.find((s) => !s.soldOut);
      setActiveSessionId(firstOpen?.publicId ?? data.sessions[0]?.publicId ?? "");
    } catch (e) {
      setSessions([]);
      setActiveSessionId("");
      setError(e instanceof ApiClientError ? e.message : "Не удалось загрузить сеансы");
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedDate || !config) return;
    void loadSessions(selectedDate, config.location.slug);
  }, [selectedDate, config, loadSessions]);

  const activeSession = sessions.find((s) => s.publicId === activeSessionId) ?? null;

  const priceByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of activeSession?.prices ?? []) {
      map.set(p.ticketTypeCode, p.unitPrice);
    }
    return map;
  }, [activeSession]);

  const totalGuests = useMemo(
    () => Object.values(qty).reduce((sum, n) => sum + n, 0),
    [qty],
  );

  const totalAmount = useMemo(() => {
    let sum = 0;
    for (const [code, count] of Object.entries(qty)) {
      sum += (priceByCode.get(code) ?? 0) * count;
    }
    return sum;
  }, [qty, priceByCode]);

  const calendarCells = useMemo(() => {
    const { year, monthIndex } = viewMonth;
    const first = new Date(year, monthIndex, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: Array<{ day: number | null; key: string; disabled: boolean }> = [];
    for (let i = 0; i < startOffset; i += 1) {
      cells.push({ day: null, key: `e-${i}`, disabled: true });
    }
    const from = config?.availableDateRange.from ?? "";
    const to = config?.availableDateRange.to ?? "";
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = toDateKey(year, monthIndex, day);
      const disabled = !from || !to || key < from || key > to;
      cells.push({ day, key, disabled });
    }
    return cells;
  }, [viewMonth, config]);

  async function handleCheckout() {
    if (!activeSession || totalGuests <= 0 || activeSession.soldOut) return;
    setSubmitting(true);
    setError(null);
    try {
      const items = Object.entries(qty)
        .filter(([, quantity]) => quantity > 0)
        .map(([ticketTypeCode, quantity]) => ({ ticketTypeCode, quantity }));
      const reservation = await createPublicReservation(
        { sessionPublicId: activeSession.publicId, items },
        createIdempotencyKey(),
      );
      window.location.href = `/checkout?reservation=${encodeURIComponent(reservation.publicId)}`;
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Не удалось зарезервировать места");
      setSubmitting(false);
    }
  }

  const freeType = config?.ticketTypes.find((t) => t.code === "INFANT");

  return (
    <section id="booking" className="booking-section container">
      <div className="booking-card">
        <div className="booking-column">
          <div className="booking-heading">
            <span className="step">1</span>
            Выберите дату
          </div>

          <div className="calendar-box">
            <div className="calendar-head">
              <button
                type="button"
                aria-label="Предыдущий месяц"
                onClick={() =>
                  setViewMonth((m) => {
                    const monthIndex = m.monthIndex - 1;
                    return monthIndex < 0
                      ? { year: m.year - 1, monthIndex: 11 }
                      : { year: m.year, monthIndex };
                  })
                }
              >
                ‹
              </button>
              <span style={{ textTransform: "capitalize" }}>
                {monthLabel(viewMonth.year, viewMonth.monthIndex)}
              </span>
              <button
                type="button"
                aria-label="Следующий месяц"
                onClick={() =>
                  setViewMonth((m) => {
                    const monthIndex = m.monthIndex + 1;
                    return monthIndex > 11
                      ? { year: m.year + 1, monthIndex: 0 }
                      : { year: m.year, monthIndex };
                  })
                }
              >
                ›
              </button>
            </div>
            <div className="calendar-days">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {calendarCells.map((cell) =>
                cell.day === null ? (
                  <span key={cell.key} />
                ) : (
                  <button
                    key={cell.key}
                    type="button"
                    disabled={cell.disabled}
                    className={selectedDate === cell.key ? "selected" : ""}
                    onClick={() => !cell.disabled && setSelectedDate(cell.key)}
                    style={cell.disabled ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                  >
                    {cell.day}
                  </button>
                ),
              )}
            </div>
          </div>
          {config && (
            <p style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
              {config.location.city} · {config.location.venue}
            </p>
          )}
        </div>

        <div className="booking-column">
          <div className="booking-heading">
            <span className="step">2</span>
            Выберите сеанс
          </div>
          <div className="session-list">
            {loadingConfig || loadingSessions ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
                <Loader2 className="animate-spin" size={18} /> Загрузка сеансов…
              </div>
            ) : sessions.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>На выбранную дату сеансов нет</p>
            ) : (
              sessions.map((item) => (
                <button
                  key={item.publicId}
                  type="button"
                  disabled={item.soldOut}
                  className={`session ${activeSessionId === item.publicId ? "active" : ""}`}
                  onClick={() => setActiveSessionId(item.publicId)}
                  style={item.soldOut ? { opacity: 0.55 } : undefined}
                >
                  <strong>{item.localTime}</strong>
                  <small className={item.status === "LOW_AVAILABILITY" || item.soldOut ? "few" : ""}>
                    {item.soldOut
                      ? "нет мест"
                      : item.status === "LOW_AVAILABILITY"
                        ? `осталось ${item.remainingSeats} мест`
                        : `осталось ${item.remainingSeats} мест`}
                  </small>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="booking-column">
          <div className="booking-heading">
            <span className="step">3</span>
            Количество билетов
          </div>
          <div className="ticket-list">
            {(config?.ticketTypes ?? [])
              .filter((t) => t.code !== "INFANT")
              .map((t) => (
                <TicketRow
                  key={t.code}
                  icon={t.code === "ADULT" ? <Users size={20} /> : <Ticket size={20} />}
                  title={t.name}
                  note={
                    priceByCode.has(t.code)
                      ? `${t.description ?? t.name} · ${formatMoneyFromKopecks(priceByCode.get(t.code) ?? 0)}`
                      : (t.description ?? "")
                  }
                  value={qty[t.code] ?? 0}
                  setValue={(value) => setQty((prev) => ({ ...prev, [t.code]: value }))}
                  max={Math.max(0, (activeSession?.remainingSeats ?? 0) - (totalGuests - (qty[t.code] ?? 0)))}
                />
              ))}
            {freeType && (
              <div className="ticket-row">
                <div className="ticket-icon">
                  <Gift size={20} />
                </div>
                <div className="ticket-copy">
                  <strong>{freeType.name}</strong>
                  <br />
                  <small>бесплатно</small>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="booking-column summary">
          <div className="booking-heading">
            <span className="step">4</span>
            Ваш заказ
          </div>
          <div className="summary-list">
            <div className="summary-row">
              <span>Дата</span>
              <strong>
                {selectedDate
                  ? new Intl.DateTimeFormat("ru-RU", {
                      day: "numeric",
                      month: "long",
                    }).format(new Date(`${selectedDate}T12:00:00`))
                  : "—"}
              </strong>
            </div>
            <div className="summary-row">
              <span>Сеанс</span>
              <strong>{activeSession?.localTime ?? "—"}</strong>
            </div>
            {(config?.ticketTypes ?? [])
              .filter((t) => (qty[t.code] ?? 0) > 0)
              .map((t) => (
                <div className="summary-row" key={t.code}>
                  <span>{t.name}</span>
                  <strong>
                    {qty[t.code]} × {formatMoneyFromKopecks(priceByCode.get(t.code) ?? 0)}
                  </strong>
                </div>
              ))}
          </div>
          {error && (
            <p style={{ color: "var(--orange-deep)", marginTop: 16, fontSize: 14 }}>{error}</p>
          )}
          <div className="total">
            <span>Итого</span>
            <strong>{formatMoneyFromKopecks(totalAmount)}</strong>
            <button
              type="button"
              className="button button-orange full"
              disabled={
                submitting ||
                !activeSession ||
                activeSession.soldOut ||
                totalGuests <= 0 ||
                totalGuests > (activeSession.remainingSeats ?? 0)
              }
              onClick={() => void handleCheckout()}
            >
              {submitting ? "Резервируем…" : "Перейти к оплате"}
            </button>
            <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
              Места резервируются на 15 минут. Итог пересчитает сервер.
            </p>
          </div>
        </aside>
      </div>

      <div className="trust-strip">
        <Trust icon={<ShieldCheck />} text="Живое общение с лемурами" />
        <Trust icon={<Clock3 />} text="Сеансы каждые 30 минут" />
        <Trust icon={<Users />} text="До 15 гостей на сеанс" />
        <Trust icon={<CalendarDays />} text="Удобная онлайн-покупка" />
      </div>
    </section>
  );
}

function TicketRow({
  icon,
  title,
  note,
  value,
  setValue,
  max,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  value: number;
  setValue: (value: number) => void;
  max: number;
}) {
  return (
    <div className="ticket-row">
      <div className="ticket-icon">{icon}</div>
      <div className="ticket-copy">
        <strong>{title}</strong>
        <br />
        <small>{note}</small>
      </div>
      <div className="counter">
        <button type="button" onClick={() => setValue(Math.max(0, value - 1))} aria-label="Меньше">
          <Minus size={15} />
        </button>
        <strong>{value}</strong>
        <button
          type="button"
          onClick={() => setValue(Math.min(max, value + 1))}
          aria-label="Больше"
          disabled={value >= max}
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function Trust({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="trust-item">
      <span className="trust-icon">{icon}</span>
      <strong>{text}</strong>
    </div>
  );
}
