"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Banknote,
  CreditCard,
  Globe,
  QrCode,
  RefreshCw,
  Search,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoneyFromKopecks, cn } from "@/lib/utils";
import { ApiClientError, apiGet } from "@/lib/api/client";
import { cashierSaleSchema } from "@/lib/validation/cashier";
import {
  cashierCheckIn,
  createCashierSale,
  getCashierMe,
  getCashierOrders,
  getCashierSessions,
  type CashierCheckInResult,
  type CashierOrderRow,
  type CashierSessionCard,
  type CashierSessionsResponse,
  type CashierUser,
} from "@/lib/api/cashier";
import { OpenShiftForm } from "@/components/cashier/OpenShiftForm";
import { useCashierShift } from "@/components/cashier/CashierShiftProvider";
import { useCurrentTime } from "@/components/cashier/use-current-time";
import {
  canSubmitTicketSelection,
  lineTotalKopecks,
  selectedTicketCount,
  setTicketQuantity,
} from "@/lib/booking/ticket-quantities";

type Filter = "today" | "all" | "paid" | "cancelled";

function formatClock(timezone: string, now: number) {
  return {
    date: new Intl.DateTimeFormat("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: timezone,
    }).format(now),
    time: new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: timezone,
    }).format(now),
  };
}

export function CashierWorkspace() {
  const { shift, loading: shiftLoading, setSheet, reload: reloadShift } = useCashierShift();
  const [user, setUser] = useState<CashierUser | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [sessionsData, setSessionsData] = useState<CashierSessionsResponse | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<CashierOrderRow[]>([]);
  const [filter, setFilter] = useState<Filter>("today");
  const [search, setSearch] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);
  const [cashEntry, setCashEntry] = useState(false);
  const [cashText, setCashText] = useState("");
  const paymentBusy = useRef(false);
  const cashReceived = /^\d{1,7}([.,]\d{1,2})?$/.test(cashText)
    ? Math.round(Number(cashText.replace(",", ".")) * 100) : null;
  type Attempt = { key: string; input: Parameters<typeof createCashierSale>[0] };
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [attemptReady, setAttemptReady] = useState(false);

  const [loadingSessions, setLoadingSessions] = useState(false);

  const timezone = sessionsData?.location.timezone ?? "Europe/Moscow";
  const now = useCurrentTime();
  const clock = formatClock(timezone, now);
  const availableSessions =
    sessionsData?.sessions.filter((session) => Date.parse(session.endsAt) > now) ?? [];

  useEffect(() => {
    getCashierMe()
      .then(setUser)
      .catch(() => {
        window.location.replace("/cashier/login");
      })
      .finally(() => setBootstrapping(false));
  }, []);

  const refreshSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await getCashierSessions();
      setSessionsData(data);
      setSelectedSessionId((current) => {
        const loadedAt = Date.now();
        return (
          current ??
          data.sessions.find(
            (session) => !session.soldOut && Date.parse(session.endsAt) > loadedAt,
          )?.publicId ??
          null
        );
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Не удалось загрузить сеансы");
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    try {
      const data = await getCashierOrders({ filter, search: search || undefined });
      setOrders(data.orders);
    } catch {
      /* keep previous list */
    }
  }, [filter, search]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      await refreshSessions();
      await refreshOrders();
    })();
  }, [user, refreshSessions, refreshOrders]);

  const selectedSession: CashierSessionCard | null =
    availableSessions.find((session) => session.publicId === selectedSessionId) ?? null;

  const totalQuantity = useMemo(() => selectedTicketCount(quantities), [quantities]);

  const totalAmount = useMemo(() => {
    if (!sessionsData) return 0;
    return lineTotalKopecks(
      quantities,
      sessionsData.ticketTypes.map((ticketType) => ({
        code: ticketType.code,
        unitPrice: ticketType.unitPrice ?? 0,
      })),
    );
  }, [sessionsData, quantities]);

  const canSell =
    Boolean(selectedSession) &&
    !selectedSession?.soldOut &&
    !selling &&
    attemptReady &&
    canSubmitTicketSelection(quantities, selectedSession?.remaining ?? 0);

  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(`evotor-checkout-${user.id}`);
      if (saved) {
        const value = JSON.parse(saved);
        if (!value || typeof value.key !== "string" || !value.key.trim()) throw new Error("Invalid attempt");
        cashierSaleSchema.parse(value.input);
        setAttempt(value); setSelling(true); paymentBusy.current = true;
      }
    } catch {
      setError("Не удалось восстановить операцию. Проверьте заказ перед новой продажей.");
      setSelling(true); paymentBusy.current = true;
    } finally { setAttemptReady(true); }
  }, [user]);

  useEffect(() => {
    if (!attempt || !user) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let number: string | null = null;
    let controller: AbortController | null = null;
    async function check() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15000);
      try {
        const order = number
          ? await apiGet<{ number: string; status: string; totalAmount: number }>(`/api/cashier/sales/status?number=${encodeURIComponent(number)}`, { signal: controller.signal })
          : await createCashierSale(attempt!.input, attempt!.key, { signal: controller.signal });
        number = order.number;
        if (stopped) return;
        if (order.status === "PAID" || order.status === "CANCELLED") {
          localStorage.removeItem(`evotor-checkout-${user!.id}`);
          setAttempt(null); setSelling(false); paymentBusy.current = false;
          if (order.status === "PAID") {
            setStatusMessage(`Чек оформлен · ${order.number} · ${formatMoneyFromKopecks(order.totalAmount)}`);
            setQuantities({}); setCashEntry(false); setCashText("");
          } else setError("Оплата отменена на кассе. Заказ не оплачен.");
          void refreshSessions(); void refreshOrders(); void reloadShift();
          return;
        }
        setStatusMessage(`Заказ ${order.number}. Ожидаем подтверждение чека от Эвотора.`);
      } catch (error) {
        if (stopped) return;
        if (!number && error instanceof ApiClientError &&
            ["VALIDATION_ERROR", "NOT_CONFIGURED", "SESSION_NOT_AVAILABLE", "SESSION_SOLD_OUT", "INSUFFICIENT_CAPACITY", "SHIFT_NOT_OPEN"].includes(error.code)) {
          localStorage.removeItem(`evotor-checkout-${user!.id}`);
          setAttempt(null); setSelling(false); paymentBusy.current = false;
          setError(error.message); return;
        }
        setStatusMessage("Проверяем результат операции. Ожидаем связь с кассой.");
      } finally { clearTimeout(timeout); }
      if (!stopped) timer = setTimeout(check, 2500);
    }
    void check();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
  }, [attempt, user, refreshSessions, refreshOrders, reloadShift]);

  const sell = (paymentMethod: "CASH" | "CARD_TERMINAL" | "CARD_ONLINE") => {
    if (!selectedSession || !canSell || !user || paymentBusy.current) return;
    if (paymentMethod === "CASH" && (cashReceived === null || cashReceived < totalAmount)) return;
    const input = {
      sessionPublicId: selectedSession.publicId,
      items: sessionsData!.ticketTypes.map(t => ({ ticketTypeCode: t.code, quantity: quantities[t.code] ?? 0 })).filter(t => t.quantity > 0),
      paymentMethod,
      ...(paymentMethod === "CASH" ? { cashReceived: cashReceived! } : {}),
    };
    const next = { key: crypto.randomUUID(), input };
    try { localStorage.setItem(`evotor-checkout-${user.id}`, JSON.stringify(next)); }
    catch { setError("Разрешите сохранение данных сайта для восстановления оплаты."); return; }
    paymentBusy.current = true;
    setSelling(true); setError(null); setStatusMessage("Передаём заказ на кассу…"); setAttempt(next);
  };

  if (bootstrapping || !user) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Skeleton className="h-40 w-80" />
      </div>
    );
  }

  if (shiftLoading && !shift) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Skeleton className="h-40 w-80" />
      </div>
    );
  }

  if (!shift) {
    return <OpenShiftForm />;
  }

  return (
    <div className="cashier-home">
      <div className="cashier-home-main">
        <div className="cashier-home-clock no-print">
          <div>
            <h2 className="font-display text-2xl font-semibold text-forest">Сеансы сегодня</h2>
            <p className="cashier-page-sub" style={{ margin: "4px 0 0" }}>
              {clock.date} · <span className="tabular-nums">{clock.time}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refreshSessions()}>
            <RefreshCw size={16} className={cn(loadingSessions && "animate-spin")} aria-hidden />
            Обновить
          </Button>
        </div>

        {loadingSessions && !sessionsData ? (
          <div className="cashier-home-sessions">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : (
          <div className="cashier-home-sessions">
            {sessionsData && availableSessions.length === 0 ? (
              <div className="cashier-empty">На сегодня больше нет сеансов для продажи.</div>
            ) : null}
            {availableSessions.map((session) => {
              const active = session.publicId === selectedSessionId;
              return (
                <motion.button
                  key={session.publicId}
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => {
                    setSelectedSessionId(session.publicId);
                    setQuantities({});
                    setError(null);
                  }}
                  className={cn(
                    "rounded-3xl border p-5 text-left transition",
                    active
                      ? "border-primary bg-orange-soft shadow-warm"
                      : "border-beige bg-white/80 hover:border-leaf",
                    session.soldOut && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-3xl font-semibold text-forest">
                      {session.localTime}
                    </span>
                    {session.soldOut ? (
                      <Badge variant="danger">SOLD OUT</Badge>
                    ) : session.remaining <= 3 ? (
                      <Badge variant="warning">Мало мест</Badge>
                    ) : (
                      <Badge variant="success">Открыт</Badge>
                    )}
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-cream p-2">
                      <dt className="text-muted-foreground">Вместимость</dt>
                      <dd className="text-base font-extrabold">{session.capacity}</dd>
                    </div>
                    <div className="rounded-xl bg-cream p-2">
                      <dt className="text-muted-foreground">Продано</dt>
                      <dd className="text-base font-extrabold">{session.sold}</dd>
                    </div>
                    <div className="rounded-xl bg-cream p-2">
                      <dt className="text-muted-foreground">Свободно</dt>
                      <dd className="text-base font-extrabold">{session.remaining}</dd>
                    </div>
                  </dl>
                  <span className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-primary px-3 py-2.5 text-sm font-extrabold text-primary-foreground">
                    Продать билет
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}

        <Card variant="glass" className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <h3 className="font-display text-xl font-semibold text-forest">Последние продажи</h3>
            <div className="relative min-w-0 flex-1 sm:ml-auto sm:max-w-xs">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="pl-9"
                placeholder="Поиск по номеру заказа"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Поиск по номеру заказа"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["today", "Сегодня"],
                ["all", "Все"],
                ["paid", "Оплаченные"],
                ["cancelled", "Отменённые"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide",
                  filter === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-beige text-forest",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-2">
            {orders.length === 0 && (
              <p className="text-sm text-muted-foreground">Продаж пока нет.</p>
            )}
            {orders.map((order) => (
              <div
                key={order.number}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-beige bg-white/70 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-extrabold text-forest">{order.number}</p>
                  <p className="text-muted-foreground">
                    {order.sessionTime} ·{" "}
                    {order.items.map((i) => `${i.ticketTypeName}×${i.quantity}`).join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold">{formatMoneyFromKopecks(order.totalAmount)}</p>
                  <Badge variant={order.status === "PAID" ? "success" : "muted"}>
                    {order.status}
                  </Badge>
                  <Link
                    href={`/cashier/orders/${order.number}/print`}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-forest underline"
                  >
                    <Printer size={12} aria-hidden />
                    Печать
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="soft" className="cashier-ops-card p-5 no-print">
          <div className="cashier-quick-actions">
            <Link href="/cashier/scan" className="cashier-btn cashier-btn-orange">
              QR
            </Link>
            <button type="button" className="cashier-btn cashier-btn-primary" onClick={() => setSheet("in")}>
              Внести
            </button>
            <button type="button" className="cashier-btn cashier-btn-ghost" onClick={() => setSheet("out")}>
              Изъять
            </button>
            <Link href="/cashier/shift" className="cashier-btn cashier-btn-ghost">
              Смена
            </Link>
          </div>
          <CashierCheckInPanel />
        </Card>
      </div>

      <aside className="cashier-home-aside">
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedSession?.publicId ?? "empty"}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
          >
            <Card variant="glass" className="p-5">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-orange">
                Панель продажи
              </p>
              <p className="mt-2 truncate text-sm font-bold text-forest">
                {sessionsData?.location.city ?? shift.location.city} ·{" "}
                {sessionsData?.location.venue ?? shift.location.name}
              </p>
              {selectedSession ? (
                <>
                  <h3 className="mt-3 font-display text-3xl font-semibold text-forest">
                    {selectedSession.localTime}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Свободно {selectedSession.remaining} из {selectedSession.capacity}
                  </p>

                  <div className="mt-4 grid gap-3">
                    {sessionsData?.ticketTypes.map((ticketType) => (
                      <div
                        key={ticketType.code}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-beige bg-white/70 p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-forest" title={ticketType.name}>
                            {ticketType.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {ticketType.unitPrice != null
                              ? formatMoneyFromKopecks(ticketType.unitPrice)
                              : "—"}
                          </p>
                        </div>
                        <QuantityStepper
                          className="shrink-0"
                          value={quantities[ticketType.code] ?? 0}
                          onChange={(next) =>
                            setQuantities((prev) =>
                              setTicketQuantity({
                                quantities: prev,
                                code: ticketType.code,
                                next,
                                remainingSeats: selectedSession.remaining,
                              }),
                            )
                          }
                          min={0}
                          max={Math.max(
                            0,
                            selectedSession.remaining - (totalQuantity - (quantities[ticketType.code] ?? 0)),
                          )}
                          valueLabel={ticketType.name}
                          decreaseLabel={`Уменьшить: ${ticketType.name}`}
                          increaseLabel={`Увеличить: ${ticketType.name}`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl bg-cream p-4">
                    <p className="text-sm text-muted-foreground">Итого</p>
                    <p className="font-display text-4xl font-semibold tabular-nums text-forest">
                      {formatMoneyFromKopecks(totalAmount)}
                    </p>
                    <p className="text-sm text-muted-foreground">{totalQuantity} билет(ов)</p>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {!canSell && totalQuantity === 0 && !selectedSession.soldOut ? (
                      <p className="text-sm text-muted-foreground" role="status">
                        Выберите хотя бы один билет
                      </p>
                    ) : null}
                    {cashEntry && <div className="rounded-xl border p-4">
                      <label htmlFor="cash-received">Получено наличными, ₽</label>
                      <Input id="cash-received" inputMode="decimal" value={cashText}
                        disabled={selling} onChange={e => setCashText(e.target.value)} />
                      <p aria-live="polite">{cashReceived === null ? "Введите сумму" : cashReceived < totalAmount
                        ? `Не хватает ${formatMoneyFromKopecks(totalAmount - cashReceived)}`
                        : `Сдача ${formatMoneyFromKopecks(cashReceived - totalAmount)}`}</p>
                      <Button disabled={!canSell || cashReceived === null || cashReceived < totalAmount}
                        onClick={() => sell("CASH")}>Пробить чек</Button>
                    </div>}
                    <Button
                      size="lg"
                      className="h-14 text-base"
                      disabled={!canSell}
                      onClick={() => setCashEntry(true)}
                    >
                      <Banknote aria-hidden />
                      Наличные
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-14 text-base"
                      disabled={!canSell}
                      onClick={() => void sell("CARD_TERMINAL")}
                    >
                      <CreditCard aria-hidden />
                      Карта
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-14 text-base"
                      disabled={!canSell}
                      onClick={() => void sell("CARD_ONLINE")}
                    >
                      <Globe aria-hidden />
                      Сайт
                    </Button>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  {selectedSessionId && availableSessions.length > 0
                    ? "Продажи на выбранный сеанс закрыты. Выберите другое время."
                    : "Выберите сеанс слева."}
                </p>
              )}

              {statusMessage && (
                <p className="mt-4 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                  {statusMessage}
                </p>
              )}
              {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            </Card>
          </motion.div>
        </AnimatePresence>
      </aside>
    </div>
  );
}

function CashierCheckInPanel() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CashierCheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await cashierCheckIn(token);
      setResult(data);
      if (data.result === "SUCCESS") setToken("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Ошибка сканирования");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <QrCode className="text-forest" aria-hidden />
        <p className="font-extrabold text-forest">Проверка QR</p>
      </div>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch" onSubmit={(e) => void onScan(e)}>
        <Input
          id="cashier-qr-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Вставьте qrToken билета"
          aria-label="Токен QR билета"
          autoComplete="off"
          className="min-w-0 flex-1 font-mono text-sm"
          required
        />
        <Button type="submit" disabled={busy || !token.trim()} className="sm:w-auto">
          {busy ? "…" : "Проверить"}
        </Button>
      </form>
      {result && (
        <p
          className={cn(
            "mt-3 rounded-2xl px-3 py-2 text-sm font-bold",
            result.result === "SUCCESS"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-amber-50 text-amber-900",
          )}
        >
          {result.message}
          {result.ticket
            ? ` · ${result.ticket.sessionLocalDate} ${result.ticket.sessionLocalTime}`
            : ""}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
