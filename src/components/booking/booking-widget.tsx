"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { formatMoneyFromKopecks, cn } from "@/lib/utils";
import { getPublicConfig, getPublicSessions, createPublicReservation } from "@/lib/api/public";
import { ApiClientError } from "@/lib/api/client";
import type { PublicConfigDto } from "@/types/dto/config";
import type { PublicSessionDto, PublicSessionsResponseDto } from "@/types/dto/session";

type ConfigStatus = "loading" | "error" | "ready";
type SessionsStatus = "loading" | "error" | "ready";

/** Builds the inclusive list of `YYYY-MM-DD` dates the date picker should offer. */
function buildDateList(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  // Bounded loop — `from`/`to` always come from the server's own capped range.
  while (cursor.getTime() <= end.getTime() && dates.length < 60) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

function formatDateLabel(dateKey: string, timeZone: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    weekday: "short",
    timeZone,
  }).format(date);
}

function availabilityLabel(session: PublicSessionDto): string {
  if (session.soldOut) return "Мест нет";
  if (session.remainingSeats === 1) return "Последнее место";
  return `Осталось ${session.remainingSeats} мест`;
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
    if (selectedDate) {
      void loadSessions(selectedDate);
    }
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

  const setQuantity = (code: string, next: number) => {
    if (!selectedSession) return;
    const clamped = Math.max(0, Math.min(next, selectedSession.remainingSeats));
    setQuantities((prev) => ({ ...prev, [code]: clamped }));
  };

  const exceedsAvailability =
    Boolean(selectedSession) && totalQuantity > (selectedSession?.remainingSeats ?? 0);
  const canContinue =
    Boolean(selectedSession) && totalQuantity > 0 && !exceedsAvailability && !submitting;

  // Guards against a double-submit firing two reservations for one click.
  const submitLockRef = useRef(false);

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
      const idempotencyKey = crypto.randomUUID();
      const reservation = await createPublicReservation(
        { sessionPublicId: selectedSession.publicId, items },
        idempotencyKey,
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
    <Card className={cn("p-5 md:p-7", compact && "shadow-none")}>
      <h2 className="mb-6 text-2xl font-black">Купите билет онлайн</h2>

      {configStatus === "loading" && (
        <div
          className="grid min-h-40 place-items-center text-sm text-muted-foreground"
          role="status"
        >
          Загружаем актуальные сеансы…
        </div>
      )}

      {configStatus === "error" && (
        <div className="grid min-h-40 place-items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            Не удалось загрузить расписание. Проверьте соединение и попробуйте ещё раз.
          </p>
          <Button variant="outline" onClick={() => void loadConfig()}>
            Повторить
          </Button>
        </div>
      )}

      {configStatus === "ready" && dateList.length === 0 && (
        <div className="grid min-h-40 place-items-center text-center text-sm text-muted-foreground">
          Сейчас нет доступных дат для онлайн-бронирования. Загляните позже.
        </div>
      )}

      {configStatus === "ready" && dateList.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr_1.45fr_.7fr]">
          <section>
            <p className="mb-3 text-sm font-extrabold text-forest">1. Выберите дату</p>
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
              {dateList.map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => selectDate(date)}
                  aria-pressed={date === selectedDate}
                  className={cn(
                    "rounded-xl border p-2 text-left text-sm capitalize",
                    date === selectedDate && "border-leaf bg-leaf text-leaf-foreground",
                  )}
                >
                  {formatDateLabel(date, timezone)}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-3 text-sm font-extrabold text-forest">2. Выберите сеанс</p>

            {sessionsStatus === "loading" && (
              <p className="text-sm text-muted-foreground" role="status">
                Загружаем сеансы…
              </p>
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
              <div className="grid grid-cols-4 gap-2">
                {sessionsData?.sessions.map((session) => (
                  <button
                    key={session.publicId}
                    type="button"
                    disabled={session.soldOut}
                    onClick={() => selectSession(session)}
                    aria-pressed={session.publicId === selectedSessionId}
                    className={cn(
                      "rounded-xl border p-2 text-xs disabled:cursor-not-allowed disabled:opacity-50",
                      session.publicId === selectedSessionId &&
                        "border-leaf bg-leaf text-leaf-foreground",
                    )}
                  >
                    <b className="block text-sm">{session.localTime}</b>
                    {availabilityLabel(session)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="mb-3 text-sm font-extrabold text-forest">3. Количество билетов</p>
            {selectedSession ? (
              selectedSession.prices.map((price) => (
                <div
                  key={price.ticketTypeCode}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1 text-sm"
                >
                  <span>{price.ticketTypeName}</span>
                  <span className="text-muted-foreground">
                    {formatMoneyFromKopecks(price.unitPrice)}
                  </span>
                  <QuantityStepper
                    value={quantities[price.ticketTypeCode] ?? 0}
                    onChange={(next) => setQuantity(price.ticketTypeCode, next)}
                    min={0}
                    max={Math.max(0, selectedSession.remainingSeats)}
                    valueLabel={price.ticketTypeName}
                    decreaseLabel={`Уменьшить: ${price.ticketTypeName}`}
                    increaseLabel={`Увеличить: ${price.ticketTypeName}`}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Выберите сеанс.</p>
            )}
            {exceedsAvailability && (
              <p className="mt-2 text-xs text-destructive">
                Доступно только {selectedSession?.remainingSeats} мест на этот сеанс.
              </p>
            )}
          </section>

          <section className="flex flex-col justify-end">
            <span className="text-sm">Итого</span>
            <strong className="my-2 text-3xl">{formatMoneyFromKopecks(totalAmount)}</strong>
            <Button onClick={() => void handleContinue()} disabled={!canContinue}>
              {submitting ? "Бронируем…" : "Продолжить"}
            </Button>
            {submitError && <p className="mt-2 text-xs text-destructive">{submitError}</p>}
          </section>
        </div>
      )}
    </Card>
  );
}
