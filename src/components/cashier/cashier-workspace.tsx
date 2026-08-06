"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Banknote,
  CreditCard,
  LogOut,
  QrCode,
  RefreshCw,
  RotateCcw,
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
import { ApiClientError } from "@/lib/api/client";
import {
  cashierCheckIn,
  cashierLogin,
  cashierLogout,
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
import { labelStatus } from "@/lib/director/labels";

type Filter = "today" | "all" | "paid" | "cancelled";

function useClock(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
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

function LoginScreen({ onSuccess }: { onSuccess: (user: CashierUser) => void }) {
  const [email, setEmail] = useState("cashier@lemuriapark.ru");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await cashierLogin(email, password);
      onSuccess(user);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="jungle-bg grid min-h-screen place-items-center p-4">
      <Card variant="glass" className="w-full max-w-md p-7">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange">Касса</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-forest">Вход кассира</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Рабочая панель продаж. QR / check-in / возвраты — на следующих этапах.
        </p>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <div className="grid gap-1.5">
            <label htmlFor="cashier-email" className="text-sm font-bold">
              Эл. почта
            </label>
            <Input
              id="cashier-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="cashier-password" className="text-sm font-bold">
              Пароль
            </label>
            <Input
              id="cashier-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? "Входим…" : "Войти"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function CashierWorkspace() {
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
  const [loadingSessions, setLoadingSessions] = useState(false);

  const timezone = sessionsData?.location.timezone ?? "Europe/Moscow";
  const clock = useClock(timezone);

  useEffect(() => {
    getCashierMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setBootstrapping(false));
  }, []);

  const refreshSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await getCashierSessions();
      setSessionsData(data);
      setSelectedSessionId((current) => {
        if (current && data.sessions.some((session) => session.publicId === current)) {
          return current;
        }
        return data.sessions.find((session) => !session.soldOut)?.publicId ?? null;
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
    void refreshSessions();
    void refreshOrders();
  }, [user, refreshSessions, refreshOrders]);

  const selectedSession: CashierSessionCard | null =
    sessionsData?.sessions.find((session) => session.publicId === selectedSessionId) ?? null;

  const totalQuantity = useMemo(
    () => Object.values(quantities).reduce((sum, value) => sum + value, 0),
    [quantities],
  );

  const totalAmount = useMemo(() => {
    if (!sessionsData) return 0;
    return sessionsData.ticketTypes.reduce(
      (sum, ticketType) => sum + (quantities[ticketType.code] ?? 0) * (ticketType.unitPrice ?? 0),
      0,
    );
  }, [sessionsData, quantities]);

  const sell = async (paymentMethod: "CASH" | "CARD_TERMINAL") => {
    if (!selectedSession || totalQuantity <= 0 || selling) return;
    setSelling(true);
    setError(null);
    setStatusMessage(null);
    try {
      const items =
        sessionsData?.ticketTypes
          .map((ticketType) => ({
            ticketTypeCode: ticketType.code,
            quantity: quantities[ticketType.code] ?? 0,
          }))
          .filter((item) => item.quantity > 0) ?? [];

      const order = await createCashierSale(
        {
          sessionPublicId: selectedSession.publicId,
          items,
          paymentMethod,
        },
        crypto.randomUUID(),
      );
      setStatusMessage(`Продажа ${order.number} · ${formatMoneyFromKopecks(order.totalAmount)}`);
      setQuantities({});
      await Promise.all([refreshSessions(), refreshOrders()]);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Продажа не выполнена");
      void refreshSessions();
    } finally {
      setSelling(false);
    }
  };

  if (bootstrapping) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Skeleton className="h-40 w-80" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onSuccess={setUser} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-beige/60">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-4 px-4 py-3 md:px-6">
          <div className="mr-auto">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-orange">
              Касса · смена открыта
            </p>
            <p className="font-display text-xl font-semibold text-forest">{user.name}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-extrabold capitalize text-forest">{clock.date}</p>
            <p className="font-display text-2xl font-semibold tabular-nums text-forest">
              {clock.time}
            </p>
          </div>
          <div className="rounded-2xl bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground">
            {sessionsData?.location.city ?? "…"} · {sessionsData?.location.venue ?? "локация"}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void cashierLogout().finally(() => setUser(null));
            }}
          >
            <LogOut size={16} aria-hidden />
            Выйти
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 md:px-6 lg:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold text-forest">Сеансы сегодня</h2>
            <Button variant="outline" size="sm" onClick={() => void refreshSessions()}>
              <RefreshCw size={16} className={cn(loadingSessions && "animate-spin")} aria-hidden />
              Обновить
            </Button>
          </div>

          {loadingSessions && !sessionsData ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sessionsData?.sessions.map((session) => {
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

          <Card variant="glass" className="mt-6 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="mr-auto font-display text-xl font-semibold text-forest">
                Последние продажи
              </h3>
              <div className="relative min-w-[200px] flex-1 md:max-w-xs">
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
                  <div>
                    <p className="font-extrabold text-forest">{order.number}</p>
                    <p className="text-muted-foreground">
                      {order.sessionTime} ·{" "}
                      {order.items.map((i) => `${i.ticketTypeName}×${i.quantity}`).join(", ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold">{formatMoneyFromKopecks(order.totalAmount)}</p>
                    <Badge variant={order.status === "PAID" ? "success" : "muted"}>
                      {labelStatus(order.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <CashierCheckInPanel />

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Card variant="soft" className="p-4 opacity-80">
              <RotateCcw className="text-forest" aria-hidden />
              <p className="mt-2 font-extrabold text-forest">Возврат</p>
              <p className="text-xs text-muted-foreground">Ещё не подключено</p>
            </Card>
            <Card variant="soft" className="p-4 opacity-80">
              <Printer className="text-forest" aria-hidden />
              <p className="mt-2 font-extrabold text-forest">Печать</p>
              <p className="text-xs text-muted-foreground">Ещё не подключено</p>
            </Card>
          </div>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
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
                {selectedSession ? (
                  <>
                    <h3 className="mt-2 font-display text-3xl font-semibold text-forest">
                      {selectedSession.localTime}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Свободно {selectedSession.remaining} из {selectedSession.capacity}
                    </p>

                    <div className="mt-5 grid gap-3">
                      {sessionsData?.ticketTypes.map((ticketType) => (
                        <div
                          key={ticketType.code}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-beige bg-white/70 p-3"
                        >
                          <div>
                            <p className="font-extrabold text-forest">{ticketType.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {ticketType.unitPrice != null
                                ? formatMoneyFromKopecks(ticketType.unitPrice)
                                : "—"}
                            </p>
                          </div>
                          <QuantityStepper
                            value={quantities[ticketType.code] ?? 0}
                            onChange={(next) =>
                              setQuantities((prev) => ({
                                ...prev,
                                [ticketType.code]: Math.max(
                                  0,
                                  Math.min(next, selectedSession.remaining),
                                ),
                              }))
                            }
                            min={0}
                            max={selectedSession.remaining}
                            valueLabel={ticketType.name}
                            decreaseLabel={`Уменьшить: ${ticketType.name}`}
                            increaseLabel={`Увеличить: ${ticketType.name}`}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-2xl bg-cream p-4">
                      <p className="text-sm text-muted-foreground">Итого</p>
                      <p className="font-display text-4xl font-semibold text-forest">
                        {formatMoneyFromKopecks(totalAmount)}
                      </p>
                      <p className="text-sm text-muted-foreground">{totalQuantity} билет(ов)</p>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <Button
                        size="lg"
                        className="h-14 text-base"
                        disabled={selling || totalQuantity === 0 || selectedSession.soldOut}
                        onClick={() => void sell("CASH")}
                      >
                        <Banknote aria-hidden />
                        Наличные
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-14 text-base"
                        disabled={selling || totalQuantity === 0 || selectedSession.soldOut}
                        onClick={() => void sell("CARD_TERMINAL")}
                      >
                        <CreditCard aria-hidden />
                        Карта
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">Выберите сеанс слева.</p>
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
      </main>
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
    <Card variant="soft" className="mt-5 p-4">
      <div className="flex items-center gap-2">
        <QrCode className="text-forest" aria-hidden />
        <p className="font-extrabold text-forest">Проверка QR</p>
      </div>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => void onScan(e)}>
        <Input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Вставьте qrToken билета"
          className="font-mono text-sm"
          required
        />
        <Button type="submit" disabled={busy || !token.trim()}>
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
    </Card>
  );
}
