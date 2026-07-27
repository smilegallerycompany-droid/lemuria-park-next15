"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { formatMoneyFromKopecks, cn } from "@/lib/utils";
import { getPublicConfig, getPublicSessions, createPublicReservation } from "@/lib/api/public";
import { ApiClientError } from "@/lib/api/client";
import type { PublicConfigDto } from "@/types/dto/config";
import type { PublicSessionDto, PublicSessionsResponseDto } from "@/types/dto/session";

type ConfigStatus = "loading" | "error" | "ready";
type SessionsStatus = "loading" | "error" | "ready";

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

function formatDateLabel(dateKey: string, timeZone: string): { day: string; weekday: string } {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return {
    day: new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      timeZone,
    }).format(date),
    weekday: new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      timeZone,
    }).format(date),
  };
}

function sessionBadge(session: PublicSessionDto) {
  if (session.soldOut) return { label: "SOLD OUT", variant: "danger" as const };
  if (session.remainingSeats === 1)
    return { label: "Последнее место", variant: "warning" as const };
  if (session.status === "LOW_AVAILABILITY")
    return { label: "Последние места", variant: "warning" as const };
  return { label: `${session.remainingSeats} мест`, variant: "success" as const };
}

export function BookingWidget({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [configStatus, setConfigStatus] = useState<ConfigStatus>("loading");
  const [config, setConfig] = useState<PublicConfigDto | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sessionsStatus, setSessionsStatus] = useState<SessionsStatus>("loading");
  const [sessionsData, setSessionsData] = useState<PublicSessionsResponseDto | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitLockRef = useRef(false);

  const loadConfig = useCallback(async () => {
    setConfigStatus("loading");
    try {
      const response = await getPublicConfig();
      setConfig(response);
      setSelectedDate((current) => current ?? response.availableDateRange.from);
      setConfigStatus("ready");
    } catch {
      setConfigStatus("error");
    }
  }, []);

  const loadSessions = useCallback(async (date: string) => {
    setSessionsStatus("loading");
    setSubmitError(null);
    try {
      const response = await getPublicSessions({ date });
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
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (selectedDate) void loadSessions(selectedDate);
  }, [selectedDate, loadSessions]);

  const dateList = useMemo(
    () =>
      config ? buildDateList(config.availableDateRange.from, config.availableDateRange.to) : [],
    [config],
  );

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

  const timezone = config?.location.timezone ?? "UTC";

  return (
    <Card variant="glass" className={cn("p-5 md:p-8", compact && "shadow-none")}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-orange">Онлайн</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-forest md:text-3xl">
            Выберите визит
          </h2>
        </div>
        {config?.location && (
          <p className="text-sm text-muted-foreground">
            {config.location.city} · {config.location.venue}
          </p>
        )}
      </div>

      {configStatus === "loading" && (
        <div className="grid gap-4" role="status" aria-label="Загрузка">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {configStatus === "error" && (
        <div className="grid min-h-40 place-items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">Не удалось загрузить расписание.</p>
          <Button variant="outline" onClick={() => void loadConfig()}>
            Повторить
          </Button>
        </div>
      )}

      {configStatus === "ready" && dateList.length > 0 && (
        <div className="grid gap-8 lg:grid-cols-[220px_1fr_280px]">
          <section>
            <p className="mb-3 text-sm font-extrabold text-forest">Дата</p>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:max-h-[420px] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pr-1">
              {dateList.map((date) => {
                const label = formatDateLabel(date, timezone);
                const active = date === selectedDate;
                return (
                  <motion.button
                    key={date}
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedDate(date)}
                    aria-pressed={active}
                    className={cn(
                      "min-w-[96px] rounded-2xl border p-3 text-left transition lg:min-w-0",
                      active
                        ? "border-transparent bg-primary text-primary-foreground shadow-warm"
                        : "border-beige bg-white/70 hover:border-leaf hover:bg-cream",
                    )}
                  >
                    <span className="block text-[11px] font-bold uppercase opacity-80">
                      {label.weekday}
                    </span>
                    <span className="mt-0.5 block text-sm font-extrabold capitalize">
                      {label.day}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="mb-3 text-sm font-extrabold text-forest">Сеанс</p>
            {sessionsStatus === "loading" && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="status">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            )}
            {sessionsStatus === "error" && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Не удалось загрузить сеансы.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedDate && void loadSessions(selectedDate)}
                >
                  Повторить
                </Button>
              </div>
            )}
            {sessionsStatus === "ready" && (sessionsData?.sessions.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">На эту дату сеансов нет.</p>
            )}
            {sessionsStatus === "ready" && (sessionsData?.sessions.length ?? 0) > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {sessionsData?.sessions.map((session) => {
                    const badge = sessionBadge(session);
                    const active = session.publicId === selectedSessionId;
                    return (
                      <motion.button
                        key={session.publicId}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        whileHover={session.soldOut ? undefined : { y: -2, scale: 1.02 }}
                        whileTap={session.soldOut ? undefined : { scale: 0.98 }}
                        type="button"
                        disabled={session.soldOut}
                        onClick={() => {
                          if (session.soldOut) return;
                          setSelectedSessionId(session.publicId);
                          setQuantities({});
                          setSubmitError(null);
                        }}
                        aria-pressed={active}
                        className={cn(
                          "rounded-3xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                          active
                            ? "border-primary bg-orange-soft shadow-warm"
                            : "border-beige bg-white/75 hover:border-leaf",
                        )}
                      >
                        <span className="block font-display text-2xl font-semibold text-forest">
                          {session.localTime}
                        </span>
                        <Badge variant={badge.variant} className="mt-3">
                          {badge.label}
                        </Badge>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            <div className="mt-8">
              <p className="mb-3 text-sm font-extrabold text-forest">Билеты</p>
              {selectedSession ? (
                <div className="grid gap-3">
                  {selectedSession.prices.map((price) => (
                    <div
                      key={price.ticketTypeCode}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-beige bg-white/70 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-extrabold text-forest">{price.ticketTypeName}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatMoneyFromKopecks(price.unitPrice)}
                        </p>
                      </div>
                      <QuantityStepper
                        value={quantities[price.ticketTypeCode] ?? 0}
                        onChange={(next) => {
                          const clamped = Math.max(
                            0,
                            Math.min(next, selectedSession.remainingSeats),
                          );
                          setQuantities((prev) => ({ ...prev, [price.ticketTypeCode]: clamped }));
                        }}
                        min={0}
                        max={Math.max(0, selectedSession.remainingSeats)}
                        valueLabel={price.ticketTypeName}
                        decreaseLabel={`Уменьшить: ${price.ticketTypeName}`}
                        increaseLabel={`Увеличить: ${price.ticketTypeName}`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Выберите сеанс.</p>
              )}
              {exceedsAvailability && (
                <p className="mt-2 text-xs text-destructive">
                  Доступно только {selectedSession?.remainingSeats} мест на этот сеанс.
                </p>
              )}
            </div>
          </section>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card variant="soft" className="p-5">
              <p className="text-sm font-bold text-muted-foreground">Итого</p>
              <p className="mt-1 font-display text-4xl font-semibold text-forest">
                {formatMoneyFromKopecks(totalAmount)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {totalQuantity > 0 ? `${totalQuantity} билет(ов)` : "Выберите количество"}
              </p>
              <Button
                className="mt-5 w-full"
                size="lg"
                onClick={() => void handleContinue()}
                disabled={!canContinue}
              >
                {submitting ? "Бронируем…" : "Перейти к оформлению"}
              </Button>
              {submitError && <p className="mt-3 text-xs text-destructive">{submitError}</p>}
            </Card>
          </aside>
        </div>
      )}
    </Card>
  );
}
