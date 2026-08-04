"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import { cashierLogout, getCashierMe, type CashierUser } from "@/lib/api/cashier";

export default function CashierProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<CashierUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getCashierMe();
        if (!cancelled) setUser(me);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : "Не удалось загрузить профиль");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await cashierLogout();
    } catch {
      /* ignore */
    }
    router.replace("/cashier");
  }

  return (
    <>
      <h1 className="cashier-page-title">Профиль</h1>
      <p className="cashier-page-sub">Текущий пользователь кассы</p>

      <div className="cashier-panel">
        {error ? <p className="cashier-error">{error}</p> : null}
        {user ? (
          <>
            <p style={{ margin: "0 0 0.35rem", fontWeight: 800, fontSize: "1.15rem" }}>{user.name}</p>
            <p style={{ margin: "0 0 0.25rem", color: "rgba(32,53,16,0.7)" }}>{user.email}</p>
            <p style={{ margin: "0 0 1.25rem", color: "rgba(32,53,16,0.55)", fontSize: "0.9rem" }}>
              Роль: {user.role}
            </p>
          </>
        ) : !error ? (
          <div className="cashier-loading">Загрузка…</div>
        ) : null}

        <button
          type="button"
          className="cashier-btn cashier-btn-ghost"
          style={{ width: "100%" }}
          onClick={onLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "Выход…" : "Выйти из аккаунта"}
        </button>
      </div>
    </>
  );
}
