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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicReservation,
  getPublicConfig,
  getPublicSessions,
} from "@/lib/api/public";
import { ApiClientError } from "@/lib/api/client";
import { createIdempotencyKey, formatMoneyFromKopecks } from "@/lib/utils";
import {
  canSubmitTicketSelection,
  emptyTicketQuantities,
  lineTotalKopecks,
  selectedTicketCount,
  setTicketQuantity,
} from "@/lib/booking/ticket-quantities";
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

function readLocationSlug(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("location")?.trim() || undefined;
}

function writeLocationSlug(slug: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("location", slug);
  const hash = url.hash || "#booking";
  window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}${hash}`);
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
  const submitLock = useRef(false);
  const [locationSlug, setLocationSlug] = useState<string | undefined>(undefined);

  useEffect(() => {
    setLocationSlug(readLocationSlug());
  }, []);

  const loadConfig = useCallback(async (slug?: string) => {
    setLoadingConfig(true);
    setError(null);
    try {
      const cfg = await getPublicConfig({ locationSlug: slug });
      setConfig(cfg);
      const paidTypes = cfg.ticketTypes.filter((t) => t.code !== "INFANT").map((t) => t.code);
      setQty(emptyTicketQuantities(paidTypes));
      if (cfg.location && slug !== cfg.location.slug) {
        setLocationSlug(cfg.location.slug);
      }
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Не удалось загрузить конфигурацию");
      setConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    if (locationSlug === undefined && typeof window !== "undefined") {
      void loadConfig(readLocationSlug());
      return;
    }
    void loadConfig(locationSlug);
  }, [locationSlug, loadConfig]);

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
    if (!selectedDate || !config?.location) return;
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

  const totalGuests = useMemo(() => selectedTicketCount(qty), [qty]);

  const totalAmount = useMemo(
    () =>
      lineTotalKopecks(
        qty,
        [...priceByCode.entries()].map(([code, unitPrice]) => ({ code, unitPrice })),
      ),
    [qty, priceByCode],
  );

  async function handleCheckout() {
    if (!activeSession || submitLock.current) return;
    if (!canSubmitTicketSelection(qty, activeSession.remainingSeats) || activeSession.soldOut) return;
    submitLock.current = true;
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
      submitLock.current = false;
    }
  }

  const freeType = config?.ticketTypes.find((t) => t.code === "INFANT");

  return (
    <section id="booking" className="booking-section container">
      <div className="booking-card booking-card-compact">
        <div className="booking-column booking-pick">
          <div className="booking-heading">
            <span className="step">1-2</span>
            Дата и время
          </div>

          {config && config.locations.length > 1 ? (
            <label className="field-select">
              <span className="field-select-label">Локация</span>
              <div className="select-shell">
                <select
                  className="booking-select"
                  value={config.location?.slug ?? ""}
                  onChange={(e) => {
                    const slug = e.target.value;
                    writeLocationSlug(slug);
                    setLocationSlug(slug);
                    setSessions([]);
                    setActiveSessionId("");
                  }}
                  aria-label="Выберите локацию"
                >
                  <option value="" disabled>
                    Выберите локацию
                  </option>
                  {config.locations.map((loc) => (
                    <option key={loc.slug} value={loc.slug}>
                      {loc.city} · {loc.venue}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          ) : null}

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
          {config?.location ? (
            <p className="booking-hint muted">
              {config.location.city} · {config.location.venue}
            </p>
          ) : config && config.locations.length > 1 ? (
            <p className="booking-hint muted">Выберите локацию, чтобы увидеть сеансы</p>
          ) : null}
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
                  icon={<Ticket size={20} />}
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
                  setValue={(value) =>
                    setQty((prev) =>
                      setTicketQuantity({
                        quantities: prev,
                        code: t.code,
                        next: value,
                        remainingSeats: activeSession?.remainingSeats ?? 0,
                      }),
                    )
                  }
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
                  <small>{freeType.description ?? "бесплатно"}</small>
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
                  : "не выбрано"}
              </strong>
            </div>
            <div className="summary-row">
              <span>Сеанс</span>
              <strong>{activeSession?.localTime ?? "не выбрано"}</strong>
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
                !canSubmitTicketSelection(qty, activeSession.remainingSeats)
              }
              onClick={() => void handleCheckout()}
            >
              {submitting ? "Резервируем…" : "Перейти к оплате"}
            </button>
            {activeSession && totalGuests === 0 && !activeSession.soldOut ? (
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }} role="status">
                Выберите хотя бы один билет
              </p>
            ) : (
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                Места резервируются на 15 минут
              </p>
            )}
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
      <div className="ticket-icon" aria-hidden>
        {icon}
      </div>
      <div className="ticket-copy">
        <strong title={title}>{title}</strong>
        <br />
        <small>{note}</small>
      </div>
      <div className="counter" role="group" aria-label={`Количество: ${title}`}>
        <button
          type="button"
          onClick={() => setValue(Math.max(0, value - 1))}
          aria-label={`Уменьшить: ${title}`}
          disabled={value <= 0}
        >
          <Minus size={15} />
        </button>
        <strong aria-live="polite">{value}</strong>
        <button
          type="button"
          onClick={() => setValue(Math.min(max, value + 1))}
          aria-label={`Увеличить: ${title}`}
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
