"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@/lib/api/client";
import { cashierLogin } from "@/lib/api/cashier";

const GENERIC_LOGIN_ERROR = "Неверный email или пароль";

export function CashierLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitLock = useRef(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current || loading) return;
    submitLock.current = true;
    setLoading(true);
    setError(null);
    try {
      await cashierLogin(email, password);
      setPassword("");
      router.replace("/cashier");
      router.refresh();
    } catch (err) {
      setPassword("");
      const message = err instanceof ApiClientError ? err.message : GENERIC_LOGIN_ERROR;
      setError(message || GENERIC_LOGIN_ERROR);
    } finally {
      submitLock.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="jungle-bg grid min-h-screen place-items-center p-4">
      <Card variant="glass" className="w-full max-w-md p-7">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange">Касса</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-forest">Вход кассира</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Продажа, смена, заказы и QR-погашение. Возврат билета делает администратор.
        </p>
        <form className="mt-6 grid gap-4" method="post" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-1.5">
            <label htmlFor="cashier-email" className="text-sm font-bold">
              Эл. почта
            </label>
            <Input
              id="cashier-email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="cashier-password" className="text-sm font-bold">
              Пароль
            </label>
            <Input
              id="cashier-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert" aria-live="assertive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? "Входим…" : "Войти"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
