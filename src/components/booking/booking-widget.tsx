"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { AlertCircle, Loader2, MapPin, RefreshCw, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { formatMoneyFromKopecks, cn } from "@/lib/utils";
import { getPublicConfig, getPublicSessions, createPublicReservation } from "@/lib/api/public";
import { ApiClientError } from "@/lib/api/client";
import type { PublicConfigDto } from "@/types/dto/config";
import type { PublicSessionDto, PublicSessionsResponseDto } from "@/types/dto/session";

type ConfigStatus = "loading" | "error" | "ready";
type SessionsStatus = "loading" | "error" | "ready";

const spring = { type: "spring" as const, stiffness: 380, damping: 28 };
const softEase = [0.22, 1, 0.36, 1] as const;

function buildDateList(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime() && dates.length < 60) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

function formatDateParts(dateKey: string, timeZone: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone }).format(date),
    day: new Intl.DateTimeFormat("ru-RU", { day: "numeric", timeZone }).format(date),
    month: new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone }).format(date),
  };
}

function seatsLabel(session: PublicSessionDto): { text: string; tone: "ok" | "low" | "out" } {
  if (session.soldOut) return { text: "Мест нет", tone: "out" };
  if (session.remainingSeats === 1) return { text: "Последнее", tone: "low" };
  if (session.status === "LOW_AVAILABILITY")
    return { text: `${session.remainingSeats} места`, tone: "low" };
  return { text: `${session.remainingSeats} мест`, tone: "ok" };
}

function ticketWord(count: number): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return "билетов";
  if (n1 === 1) return "билет";
  if (n1 >= 2 && n1 <= 4) return "билета";
  return "билетов";
}

function StepDot({
  active,
  done,
  index,
  label,
}: {
  active: boolean;
  done: boolean;
  index: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "grid size-7 place-items-center rounded-full text-[11px] font-extrabold transition-colors duration-300",
          active && "bg-primary text-primary-foreground shadow-warm",
          done && !active && "bg-leaf/70 text-forest",
          !active && !done && "bg-beige text-muted-foreground",
        )}
        aria-hidden
      >
        {index}
      </span>
      <span
        className={cn(
          "hidden text-xs font-extrabold uppercase tracking-wide sm:inline",
          active ? "text-forest" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function DateChipSkeleton() {
  return (
    <div className="skeleton h-[88px] w-[72px] shrink-0 rounded-3xl sm:w-[80px]" aria-hidden />
  );
}

function SessionChipSkeleton() {
  return <div className="skeleton h-[92px] rounded-[1.35rem]" aria-hidden />;
}

export function BookingWidget({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const dateRailRef = useRef<HTMLDivElement>(null);
  const submitLockRef = useRef(false);

  const [configStatus, setConfigStatus] = useState<ConfigStatus>("loading");
  const [config, setConfig] = useState<PublicConfigDto | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sessionsStatus, setSessionsStatus] = useState<SessionsStatus>("loading");
  const [sessionsData, setSessionsData] = useState<PublicSessionsResponseDto | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [locationSlug, setLocationSlug] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLocationSlug(new URLSearchParams(window.location.search).get("location")?.trim() || undefined);
  }, []);

  const loadConfig = useCallback(async (slug?: string) => {
    setConfigStatus("loading");
    try {
      const response = await getPublicConfig({ locationSlug: slug });
      setConfig(response);
      setSelectedDate((current) => current ?? response.availableDateRange.from);
      if (response.location && slug !== response.location.slug) {
        setLocationSlug(response.location.slug);
      }
      setConfigStatus("ready");
    } catch {
      setConfigStatus("error");
    }
  }, []);

  const loadSessions = useCallback(async (date: string, slug?: string) => {
    setSessionsStatus("loading");
    setSubmitError(null);
    try {
      const response = await getPublicSessions({ date, locationSlug: slug });
      setSessionsData(response);
      const firstAvailable = response.sessions.find((session) => !session.soldOut);
      setSelectedSessionId(firstAvailable?.publicId ?? response.sessions[0]?.publicId ?? null);
      setQuantities({});
      setSessionsStatus("ready");
    } catch {
      setSessionsStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadConfig(locationSlug);
  }, [loadConfig, locationSlug]);

  useEffect(() => {
    if (selectedDate && config?.location) void loadSessions(selectedDate, config.location.slug);
  }, [selectedDate, loadSessions, config]);

  // Keep selected date chip in view on the snap rail.
  useEffect(() => {
    if (!selectedDate || !dateRailRef.current) return;
    const active = dateRailRef.current.querySelector<HTMLElement>(`[data-date="${selectedDate}"]`);
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDate]);

  const dateList = useMemo(() => {
    if (!config) return [];
    const closed = new Set(config.closedWeekdays ?? []);
    const weekdayEnum = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ] as const;
    return buildDateList(config.availableDateRange.from, config.availableDateRange.to).filter(
      (key) => !closed.has(weekdayEnum[new Date(`${key}T12:00:00`).getDay()]),
    );
  }, [config]);

  const selectedSession =
    sessionsData?.sessions.find((session) => session.publicId === selectedSessionId) ?? null;

  const totalQuantity = useMemo(
    () => Object.values(quantities).reduce((sum, value) => sum + value, 0),
    [quantities],
  );

  const totalAmount = useMemo(() => {
    if (!selectedSession) return 0;
    return selectedSession.prices.reduce(
      (sum, price) => sum + (quantities[price.ticketTypeCode] ?? 0) * price.unitPrice,
      0,
    );
  }, [selectedSession, quantities]);

  const exceedsAvailability =
    Boolean(selectedSession) && totalQuantity > (selectedSession?.remainingSeats ?? 0);
  const canContinue =
    Boolean(selectedSession) && totalQuantity > 0 && !exceedsAvailability && !submitting;

  const step = !selectedDate
    ? 1
    : !selectedSession || selectedSession.soldOut
      ? 2
      : totalQuantity > 0
        ? 3
        : 2;

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setSubmitError(null);
  };

  const selectSession = (session: PublicSessionDto) => {
    if (session.soldOut) return;
    setSelectedSessionId(session.publicId);
    setQuantities({});
    setSubmitError(null);
  };

  const handleContinue = async () => {
    if (!selectedSession || !canContinue || submitLockRef.current) return;
    const items = selectedSession.prices
      .map((price) => ({
        ticketTypeCode: price.ticketTypeCode,
        quantity: quantities[price.ticketTypeCode] ?? 0,
      }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0) return;

    submitLockRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const reservation = await createPublicReservation(
        { sessionPublicId: selectedSession.publicId, items },
        crypto.randomUUID(),
      );
      router.push(`/checkout?reservation=${encodeURIComponent(reservation.publicId)}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setSubmitError(error.message);
        if (
          error.code === "INSUFFICIENT_CAPACITY" ||
          error.code === "SESSION_SOLD_OUT" ||
          error.code === "SESSION_NOT_AVAILABLE"
        ) {
          void loadSessions(selectedDate ?? "");
        }
      } else {
        setSubmitError("Не удалось создать бронирование. Попробуйте ещё раз.");
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const timezone = config?.location?.timezone ?? "UTC";

  const summary = (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
          Итого
        </p>
        <motion.p
          key={totalAmount}
          initial={{ opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1 font-display text-4xl font-semibold tabular-nums tracking-tight text-forest"
        >
          {formatMoneyFromKopecks(totalAmount)}
        </motion.p>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalQuantity > 0
            ? `${totalQuantity} ${ticketWord(totalQuantity)}${
                selectedSession ? ` · ${selectedSession.localTime}` : ""
              }`
            : "Выберите сеанс и количество"}
        </p>
      </div>

      <Button
        className="h-14 w-full rounded-2xl text-base shadow-warm"
        size="lg"
        onClick={() => void handleContinue()}
        disabled={!canContinue}
      >
        {submitting ? (
          <>
            <Loader2 className="animate-spin" size={18} aria-hidden />
            Бронируем…
          </>
        ) : (
          <>
            <Ticket size={18} aria-hidden />
            Перейти к оформлению
          </>
        )}
      </Button>

      <AnimatePresence>
        {submitError && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
            {submitError}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <LayoutGroup>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: softEase }}
        className={cn(
          "relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 shadow-glass backdrop-blur-xl",
          "ring-1 ring-black/[0.03]",
          compact && "shadow-none",
        )}
      >
        {/* Soft atmospheric glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-gradient-to-br from-leaf/30 via-orange-soft/40 to-transparent blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-10 size-48 rounded-full bg-gradient-to-tr from-cream via-beige/50 to-transparent blur-2xl"
        />

        <div className="relative p-5 pb-28 sm:p-6 md:p-8">
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-orange">
                Онлайн-касса
              </p>
              <h2 className="mt-1 font-display text-[1.75rem] font-semibold leading-none tracking-tight text-forest md:text-3xl">
                Купить билет
              </h2>
            </div>
            {config && config.locations.length > 1 ? (
              <label className="mt-3 block text-sm font-bold text-forest">
                Локация
                <select
                  className="mt-1 w-full rounded-xl border border-beige bg-white px-3 py-2"
                  value={config.location?.slug ?? ""}
                  onChange={(e) => {
                    const slug = e.target.value;
                    setLocationSlug(slug);
                    const url = new URL(window.location.href);
                    url.searchParams.set("location", slug);
                    window.history.replaceState({}, "", url.toString());
                  }}
                >
                  <option value="">Выберите локацию</option>
                  {config.locations.map((loc) => (
                    <option key={loc.slug} value={loc.slug}>
                      {loc.city} · {loc.venue}
                    </option>
                  ))}
                </select>
              </label>
            ) : config?.location ? (
              <motion.div
                layout
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-beige bg-white/80 px-3 py-1.5 text-xs font-bold text-forest shadow-sm"
              >
                <MapPin size={13} className="shrink-0 text-orange" aria-hidden />
                <span className="truncate">
                  {config.location.city}
                  <span className="text-muted-foreground"> · {config.location.venue}</span>
                </span>
              </motion.div>
            ) : null}
          </div>

          {/* Progress */}
          <div
            className="mb-7 flex items-center gap-3 sm:gap-4"
            aria-label={`Шаг ${Math.min(step, 3)} из 3`}
          >
            <StepDot index={1} label="Дата" active={step === 1} done={step > 1} />
            <div className="h-px flex-1 bg-gradient-to-r from-beige to-beige/30" aria-hidden />
            <StepDot index={2} label="Сеанс" active={step === 2} done={step > 2} />
            <div className="h-px flex-1 bg-gradient-to-r from-beige to-beige/30" aria-hidden />
            <StepDot index={3} label="Билеты" active={step === 3} done={false} />
          </div>

          {configStatus === "loading" && (
            <div className="grid gap-6" role="status" aria-label="Загрузка кассы">
              <div className="flex gap-2.5 overflow-hidden">
                {Array.from({ length: 7 }).map((_, i) => (
                  <DateChipSkeleton key={i} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SessionChipSkeleton key={i} />
                ))}
              </div>
            </div>
          )}

          {configStatus === "error" && (
            <div className="grid min-h-48 place-items-center gap-4 rounded-3xl border border-dashed border-beige bg-cream/40 px-6 text-center">
              <AlertCircle className="text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Не удалось загрузить расписание. Проверьте соединение.
              </p>
              <Button variant="outline" onClick={() => void loadConfig()}>
                <RefreshCw size={16} aria-hidden />
                Повторить
              </Button>
            </div>
          )}

          {configStatus === "ready" && dateList.length === 0 && (
            <div className="grid min-h-40 place-items-center rounded-3xl bg-cream/50 text-sm text-muted-foreground">
              Сейчас нет доступных дат для бронирования.
            </div>
          )}

          {configStatus === "ready" && dateList.length > 0 && (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
              <div className="min-w-0 space-y-8">
                {/* Dates */}
                <section aria-labelledby="booking-date-heading">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <h3
                      id="booking-date-heading"
                      className="text-sm font-extrabold tracking-wide text-forest"
                    >
                      Дата
                    </h3>
                    <p className="text-xs text-muted-foreground sm:hidden">Листайте →</p>
                  </div>

                  <div
                    ref={dateRailRef}
                    className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    role="listbox"
                    aria-label="Выбор даты"
                  >
                    {dateList.map((date) => {
                      const parts = formatDateParts(date, timezone);
                      const active = date === selectedDate;
                      return (
                        <motion.button
                          key={date}
                          data-date={date}
                          type="button"
                          role="option"
                          aria-selected={active}
                          whileTap={{ scale: 0.94 }}
                          transition={spring}
                          onClick={() => selectDate(date)}
                          className={cn(
                            "relative flex h-[88px] w-[72px] shrink-0 snap-center flex-col items-center justify-center rounded-3xl border text-center transition-colors sm:w-[80px]",
                            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
                            active
                              ? "border-transparent text-primary-foreground"
                              : "border-beige/90 bg-white/80 text-forest hover:border-leaf hover:bg-cream",
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId="date-pill"
                              className="absolute inset-0 rounded-3xl bg-primary shadow-warm"
                              transition={spring}
                            />
                          )}
                          <span className="relative z-10 text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                            {parts.weekday}
                          </span>
                          <span className="relative z-10 mt-0.5 font-display text-2xl font-semibold leading-none">
                            {parts.day}
                          </span>
                          <span className="relative z-10 mt-1 text-[10px] font-bold capitalize opacity-75">
                            {parts.month}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </section>

                {/* Sessions */}
                <section aria-labelledby="booking-session-heading">
                  <h3
                    id="booking-session-heading"
                    className="mb-3 text-sm font-extrabold tracking-wide text-forest"
                  >
                    Сеанс
                  </h3>

                  {sessionsStatus === "loading" && (
                    <div
                      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4"
                      role="status"
                      aria-label="Загрузка сеансов"
                    >
                      {Array.from({ length: 8 }).map((_, i) => (
                        <SessionChipSkeleton key={i} />
                      ))}
                    </div>
                  )}

                  {sessionsStatus === "error" && (
                    <div className="flex flex-col items-start gap-3 rounded-3xl border border-dashed border-beige bg-cream/40 p-5">
                      <p className="text-sm text-muted-foreground">Не удалось загрузить сеансы.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => selectedDate && void loadSessions(selectedDate)}
                      >
                        <RefreshCw size={14} aria-hidden />
                        Повторить
                      </Button>
                    </div>
                  )}

                  {sessionsStatus === "ready" && (sessionsData?.sessions.length ?? 0) === 0 && (
                    <div className="rounded-3xl bg-cream/60 px-5 py-8 text-center text-sm text-muted-foreground">
                      На эту дату сеансов нет — выберите другой день.
                    </div>
                  )}

                  {sessionsStatus === "ready" && (sessionsData?.sessions.length ?? 0) > 0 && (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                      <AnimatePresence mode="popLayout">
                        {sessionsData?.sessions.map((session, index) => {
                          const seats = seatsLabel(session);
                          const active = session.publicId === selectedSessionId && !session.soldOut;
                          return (
                            <motion.button
                              key={session.publicId}
                              layout
                              initial={{ opacity: 0, y: 10, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ ...spring, delay: Math.min(index * 0.02, 0.16) }}
                              whileHover={session.soldOut ? undefined : { y: -3 }}
                              whileTap={session.soldOut ? undefined : { scale: 0.97 }}
                              type="button"
                              disabled={session.soldOut}
                              aria-pressed={active}
                              aria-label={`Сеанс ${session.localTime}, ${seats.text}`}
                              onClick={() => selectSession(session)}
                              className={cn(
                                "relative flex min-h-[92px] flex-col items-start justify-between overflow-hidden rounded-[1.35rem] border p-3.5 text-left transition-colors",
                                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
                                "disabled:cursor-not-allowed disabled:opacity-40",
                                active
                                  ? "border-transparent"
                                  : "border-beige/90 bg-white/85 hover:border-leaf hover:bg-cream/80",
                              )}
                            >
                              {active && (
                                <motion.span
                                  layoutId="session-pill"
                                  className="absolute inset-0 bg-gradient-to-br from-orange-soft via-white to-cream"
                                  transition={spring}
                                />
                              )}
                              {active && (
                                <span
                                  aria-hidden
                                  className="absolute inset-x-0 top-0 h-1 bg-primary"
                                />
                              )}
                              <span className="relative z-10 font-display text-[1.65rem] font-semibold leading-none tracking-tight text-forest">
                                {session.localTime}
                              </span>
                              <span
                                className={cn(
                                  "relative z-10 mt-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                                  seats.tone === "ok" && "bg-emerald-100 text-emerald-800",
                                  seats.tone === "low" && "bg-amber-100 text-amber-900",
                                  seats.tone === "out" && "bg-rose-100 text-rose-800",
                                )}
                              >
                                {seats.text}
                              </span>
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </section>

                {/* Tickets */}
                <section aria-labelledby="booking-tickets-heading">
                  <h3
                    id="booking-tickets-heading"
                    className="mb-3 text-sm font-extrabold tracking-wide text-forest"
                  >
                    Билеты
                  </h3>

                  <AnimatePresence mode="wait">
                    {!selectedSession || selectedSession.soldOut ? (
                      <motion.p
                        key="empty-tickets"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="rounded-3xl border border-dashed border-beige bg-cream/40 px-5 py-6 text-sm text-muted-foreground"
                      >
                        Сначала выберите свободный сеанс.
                      </motion.p>
                    ) : (
                      <motion.div
                        key={selectedSession.publicId}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.28, ease: softEase }}
                        className="grid gap-2.5"
                      >
                        {selectedSession.prices.map((price, index) => (
                          <motion.div
                            key={price.ticketTypeCode}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05, ...spring }}
                            className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-beige/90 bg-white/90 px-4 py-3.5 shadow-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-extrabold text-forest">
                                {price.ticketTypeName}
                              </p>
                              <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                                {formatMoneyFromKopecks(price.unitPrice)}
                              </p>
                            </div>
                            <QuantityStepper
                              size="md"
                              value={quantities[price.ticketTypeCode] ?? 0}
                              onChange={(next) => {
                                const clamped = Math.max(
                                  0,
                                  Math.min(next, selectedSession.remainingSeats),
                                );
                                setQuantities((prev) => ({
                                  ...prev,
                                  [price.ticketTypeCode]: clamped,
                                }));
                              }}
                              min={0}
                              max={Math.max(0, selectedSession.remainingSeats)}
                              valueLabel={price.ticketTypeName}
                              decreaseLabel={`Уменьшить: ${price.ticketTypeName}`}
                              increaseLabel={`Увеличить: ${price.ticketTypeName}`}
                            />
                          </motion.div>
                        ))}
                        {exceedsAvailability && (
                          <p className="text-xs text-destructive" role="alert">
                            Доступно только {selectedSession.remainingSeats} мест на этот сеанс.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              </div>

              {/* Desktop summary */}
              <aside className="hidden lg:block">
                <div className="sticky top-24 rounded-3xl border border-beige/80 bg-gradient-to-b from-cream/90 to-white/90 p-6 shadow-soft backdrop-blur">
                  {summary}
                </div>
              </aside>
            </div>
          )}
        </div>

        {/* Mobile sticky checkout bar */}
        {configStatus === "ready" && dateList.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/60 bg-white/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(60,80,40,0.1)] backdrop-blur-xl lg:hidden">
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {totalQuantity > 0
                    ? `${totalQuantity} ${ticketWord(totalQuantity)}`
                    : "К оформлению"}
                </p>
                <p className="font-display text-xl font-semibold tabular-nums text-forest">
                  {formatMoneyFromKopecks(totalAmount)}
                </p>
              </div>
              <Button
                className="h-12 shrink-0 rounded-2xl px-5 shadow-warm"
                onClick={() => void handleContinue()}
                disabled={!canContinue}
              >
                {submitting ? <Loader2 className="animate-spin" size={18} /> : "Далее"}
              </Button>
            </div>
            {submitError && (
              <p className="mx-auto mt-2 max-w-lg text-xs text-destructive" role="alert">
                {submitError}
              </p>
            )}
          </div>
        )}
      </motion.div>
    </LayoutGroup>
  );
}
