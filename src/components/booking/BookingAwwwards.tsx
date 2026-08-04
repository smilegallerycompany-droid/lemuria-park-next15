"use client";

import {
  CalendarDays,
  ChevronDown,
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

/** Enough for the full exhibition window (1 Aug – 15 Sep), excluding closed days. */
const NEAREST_DATES_LIMIT = 60;
const NEAREST_SESSIONS_LIMIT = 8;

const JS_WEEKDAY_TO_ENUM = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function eachDateKey(from: string, to: string, limit: number): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor.getTime() <= end.getTime() && out.length < limit) {
    out.push(
      `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function formatDateOption(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date);
  const dayMonth = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(date);
  return `${dayMonth}, ${weekday}`;
}

function weekdayEnum(dateKey: string) {
  return JS_WEEKDAY_TO_ENUM[new Date(`${dateKey}T12:00:00`).getDay()];
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingConfig(true);
        const cfg = await getPublicConfig();
        if (cancelled) return;
        setConfig(cfg);
        const initial: QtyMap = {};
        for (const t of cfg.ticketTypes) {
          if (t.code === "ADULT") initial[t.code] = 2;
          else if (t.code === "CHILD") initial[t.code] = 1;
          else initial[t.code] = 0;
        }
        setQty(initial);
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

  const dateOptions = useMemo(() => {
    if (!config) return [];
    const closed = new Set(config.closedWeekdays ?? []);
    return eachDateKey(
      config.availableDateRange.from,
      config.availableDateRange.to,
      NEAREST_DATES_LIMIT,
    ).filter((key) => !closed.has(weekdayEnum(key)));
  }, [config]);

  useEffect(() => {
    if (dateOptions.length === 0) {
      setSelectedDate("");
      return;
    }
    if (!dateOptions.includes(selectedDate)) {
      setSelectedDate(dateOptions[0]);
    }
  }, [dateOptions, selectedDate]);

  const loadSessions = useCallback(async (date: string, locationSlug?: string) => {
    setLoadingSessions(true);
    setError(null);
    try {
      const data = await getPublicSessions({ date, locationSlug });
      setSessions(data.sessions);
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

  /** Only upcoming (not past) and not sold-out — nearest N times. */
  const nearestSessions = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter((s) => !s.soldOut && new Date(s.startsAt).getTime() > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, NEAREST_SESSIONS_LIMIT);
  }, [sessions]);

  useEffect(() => {
    if (nearestSessions.length === 0) {
      setActiveSessionId("");
      return;
    }
    if (!nearestSessions.some((s) => s.publicId === activeSessionId)) {
      setActiveSessionId(nearestSessions[0].publicId);
    }
  }, [nearestSessions, activeSessionId]);

  const activeSession = nearestSessions.find((s) => s.publicId === activeSessionId) ?? null;

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
      <div className="booking-card booking-card-compact">
        <div className="booking-column booking-pick">
          <div className="booking-heading">
            <span className="step">1–2</span>
            Дата и время
          </div>

          <label className="field-select">
            <span className="field-select-label">
              <CalendarDays size={16} /> Дата
            </span>
            <div className="select-shell">
              <select
                className="booking-select"
                value={selectedDate}
                disabled={loadingConfig || dateOptions.length === 0}
                onChange={(e) => setSelectedDate(e.target.value)}
                aria-label="Выберите дату"
              >
                {dateOptions.map((key) => (
                  <option key={key} value={key}>
                    {formatDateOption(key)}
                  </option>
                ))}
              </select>
              <ChevronDown className="select-chevron" size={18} aria-hidden />
            </div>
          </label>

          <label className="field-select">
            <span className="field-select-label">
              <Clock3 size={16} /> Ближайшее время
            </span>
            <div className="select-shell">
              <select
                className="booking-select"
                value={activeSessionId}
                disabled={loadingSessions || nearestSessions.length === 0}
                onChange={(e) => setActiveSessionId(e.target.value)}
                aria-label="Выберите время сеанса"
              >
                {nearestSessions.length === 0 ? (
                  <option value="">
                    {loadingSessions ? "Загрузка…" : "Нет ближайших сеансов"}
                  </option>
                ) : (
                  nearestSessions.map((item) => (
                    <option key={item.publicId} value={item.publicId}>
                      {item.localTime}
                      {item.status === "LOW_AVAILABILITY"
                        ? ` · осталось ${item.remainingSeats}`
                        : ` · свободно ${item.remainingSeats}`}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="select-chevron" size={18} aria-hidden />
            </div>
          </label>

          {loadingSessions && (
            <p className="booking-hint">
              <Loader2 className="animate-spin" size={16} /> Обновляем сеансы…
            </p>
          )}
          {!loadingSessions && nearestSessions.length > 0 && (
            <p className="booking-hint">Показаны ближайшие свободные сеансы на выбранный день</p>
          )}
          {config && (
            <p className="booking-hint muted">
              {config.location.city} · {config.location.venue}
            </p>
          )}
        </div>

        <div className="booking-column">
          <div className="booking-heading">
            <span className="step">3</span>
            Билеты
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
                      ? `${t.description ?? ""} · ${formatMoneyFromKopecks(priceByCode.get(t.code) ?? 0)}`.replace(
                          /^ · /,
                          "",
                        )
                      : (t.description ?? "")
                  }
                  value={qty[t.code] ?? 0}
                  setValue={(value) => setQty((prev) => ({ ...prev, [t.code]: value }))}
                  max={Math.max(
                    0,
                    (activeSession?.remainingSeats ?? 0) - (totalGuests - (qty[t.code] ?? 0)),
                  )}
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
              Места резервируются на 15 минут
            </p>
          </div>
        </aside>
      </div>

      <div className="trust-strip">
        <Trust icon={<ShieldCheck />} text="Онлайн-оплата билетов" />
        <Trust icon={<Clock3 />} text="Только ближайшие сеансы" />
        <Trust icon={<Users />} text="До 15 гостей на сеанс" />
        <Trust icon={<CalendarDays />} text="Интересные факты о Лемурах и их жизни" />
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
