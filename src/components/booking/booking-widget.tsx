"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { formatMoneyFromKopecks, cn } from "@/lib/utils";
import { formatDateInTimezone } from "@/lib/datetime";
import { getPublicSessions, createReservation } from "@/lib/api/public";
import { ApiClientError } from "@/lib/api/client";
import type { SessionDto, SessionsResponseDto } from "@/types/dto/session";

type LoadStatus = "loading" | "error" | "ready";

interface DateGroup {
  dateKey: string;
  label: string;
  sessions: SessionDto[];
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

function formatTimeLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function groupSessionsByDate(data: SessionsResponseDto): DateGroup[] {
  const groups = new Map<string, SessionDto[]>();
  for (const session of data.sessions) {
    const dateKey = formatDateInTimezone(new Date(session.startsAt), data.location.timezone);
    const bucket = groups.get(dateKey);
    if (bucket) {
      bucket.push(session);
    } else {
      groups.set(dateKey, [session]);
    }
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, sessions]) => ({
      dateKey,
      label: formatDateLabel(dateKey, data.location.timezone),
      sessions,
    }));
}

export function BookingWidget({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<SessionsResponseDto | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setSubmitError(null);
    try {
      const response = await getPublicSessions({});
      setData(response);
      const groups = groupSessionsByDate(response);
      const firstGroup = groups[0] ?? null;
      setSelectedDateKey(firstGroup?.dateKey ?? null);
      setSelectedSessionId(firstGroup?.sessions[0]?.id ?? null);
      setQuantities({});
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dateGroups = useMemo(() => (data ? groupSessionsByDate(data) : []), [data]);
  const selectedGroup = dateGroups.find((group) => group.dateKey === selectedDateKey) ?? null;
  const selectedSession =
    selectedGroup?.sessions.find((session) => session.id === selectedSessionId) ?? null;

  const totalQuantity = useMemo(
    () => Object.values(quantities).reduce((sum, value) => sum + value, 0),
    [quantities],
  );

  const totalAmount = useMemo(() => {
    if (!selectedSession) return 0;
    return selectedSession.prices.reduce(
      (sum, price) => sum + (quantities[price.ticketTypeCode] ?? 0) * price.unitPriceAmount,
      0,
    );
  }, [selectedSession, quantities]);

  const selectDate = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    const group = dateGroups.find((candidate) => candidate.dateKey === dateKey);
    setSelectedSessionId(group?.sessions[0]?.id ?? null);
    setQuantities({});
    setSubmitError(null);
  };

  const selectSession = (session: SessionDto) => {
    if (session.available <= 0) return;
    setSelectedSessionId(session.id);
    setQuantities({});
    setSubmitError(null);
  };

  const setQuantity = (code: string, next: number) => {
    setQuantities((prev) => ({ ...prev, [code]: next }));
  };

  const exceedsAvailability = Boolean(selectedSession) && totalQuantity > (selectedSession?.available ?? 0);
  const canContinue = Boolean(selectedSession) && totalQuantity > 0 && !exceedsAvailability;

  const handleContinue = async () => {
    if (!selectedSession || !canContinue) return;
    const items = selectedSession.prices
      .map((price) => ({ ticketTypeCode: price.ticketTypeCode, quantity: quantities[price.ticketTypeCode] ?? 0 }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const reservation = await createReservation({ sessionId: selectedSession.id, items });
      router.push(`/checkout?reservation=${encodeURIComponent(reservation.id)}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setSubmitError(error.message);
        if (error.code === "INSUFFICIENT_CAPACITY" || error.code === "SESSION_UNAVAILABLE") {
          void load();
        }
      } else {
        setSubmitError("Не удалось создать бронирование. Попробуйте ещё раз.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className={cn("p-5 md:p-7", compact && "shadow-none")}>
      <h2 className="mb-6 text-2xl font-black">Купите билет онлайн</h2>

      {status === "loading" && (
        <div className="grid min-h-40 place-items-center text-sm text-muted-foreground" role="status">
          Загружаем актуальные сеансы…
        </div>
      )}

      {status === "error" && (
        <div className="grid min-h-40 place-items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            Не удалось загрузить сеансы. Проверьте соединение и попробуйте ещё раз.
          </p>
          <Button variant="outline" onClick={() => void load()}>
            Повторить
          </Button>
        </div>
      )}

      {status === "ready" && dateGroups.length === 0 && (
        <div className="grid min-h-40 place-items-center text-center text-sm text-muted-foreground">
          Сейчас нет доступных сеансов для онлайн-бронирования. Загляните позже.
        </div>
      )}

      {status === "ready" && dateGroups.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr_1.45fr_.7fr]">
          <section>
            <p className="mb-3 text-sm font-extrabold text-forest">1. Выберите дату</p>
            <div className="flex flex-col gap-2">
              {dateGroups.map((group) => (
                <button
                  key={group.dateKey}
                  type="button"
                  onClick={() => selectDate(group.dateKey)}
                  aria-pressed={group.dateKey === selectedDateKey}
                  className={cn(
                    "rounded-xl border p-2 text-left text-sm capitalize",
                    group.dateKey === selectedDateKey && "border-leaf bg-leaf text-leaf-foreground",
                  )}
                >
                  {group.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-3 text-sm font-extrabold text-forest">2. Выберите сеанс</p>
            {selectedGroup && selectedGroup.sessions.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {selectedGroup.sessions.map((session) => {
                  const soldOut = session.available <= 0;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      disabled={soldOut}
                      onClick={() => selectSession(session)}
                      aria-pressed={session.id === selectedSessionId}
                      className={cn(
                        "rounded-xl border p-2 text-xs disabled:cursor-not-allowed disabled:opacity-50",
                        session.id === selectedSessionId && "border-leaf bg-leaf text-leaf-foreground",
                      )}
                    >
                      <b className="block text-sm">
                        {formatTimeLabel(session.startsAt, data?.location.timezone ?? "UTC")}
                      </b>
                      {soldOut ? "Мест нет" : `Осталось ${session.available}`}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">На эту дату сеансов нет.</p>
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
                    {formatMoneyFromKopecks(price.unitPriceAmount)}
                  </span>
                  <QuantityStepper
                    value={quantities[price.ticketTypeCode] ?? 0}
                    onChange={(next) => setQuantity(price.ticketTypeCode, next)}
                    min={0}
                    max={Math.max(0, selectedSession.available)}
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
                Доступно только {selectedSession?.available} мест на этот сеанс.
              </p>
            )}
          </section>

          <section className="flex flex-col justify-end">
            <span className="text-sm">Итого</span>
            <strong className="my-2 text-3xl">{formatMoneyFromKopecks(totalAmount)}</strong>
            <Button onClick={handleContinue} disabled={!canContinue || submitting}>
              {submitting ? "Бронируем…" : "Продолжить"}
            </Button>
            {submitError && <p className="mt-2 text-xs text-destructive">{submitError}</p>}
          </section>
        </div>
      )}
    </Card>
  );
}
