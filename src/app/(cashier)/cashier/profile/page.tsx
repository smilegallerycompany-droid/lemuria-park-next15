"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiGet, apiPost } from "@/lib/api/client";
import { cashierLogout } from "@/lib/api/cashier";
import { ConfirmDialog, ErrorAlert, PageHeader, StatusBadge } from "@/components/internal";
import { formatMoneyFromKopecks } from "@/lib/utils";
import { labelRole, labelStatus } from "@/lib/director/labels";

type ProfileResponse = {
  profile: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
    locations: Array<{ id: string; name: string; timezone: string }>;
    timezone: string;
  };
  stats: {
    todayRevenueKopecks: number;
    todayOrders: number;
    weekRevenueKopecks: number;
    weekOrders: number;
    weekTickets: number;
    cashKopecks: number;
    cardKopecks: number;
    siteKopecks: number;
    averageOrderValueKopecks: number;
    checkInsWeek: number;
  };
  sales: Array<{
    id: string;
    number: string;
    status: string;
    totalAmount: number;
    createdAt: string;
    ticketCount: number;
    paymentMethod: string | null;
    sessionStartsAt: string;
  }>;
};

type Prefs = {
  scanSound: boolean;
  scanVibrate: boolean;
  preferredCamera: "environment" | "user";
  compactCashier: boolean;
};

const PREFS_KEY = "lemuria.cashier.prefs";

function loadPrefs(): Prefs {
  if (typeof window === "undefined") {
    return { scanSound: true, scanVibrate: true, preferredCamera: "environment", compactCashier: false };
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return { scanSound: true, scanVibrate: true, preferredCamera: "environment", compactCashier: false };
    }
    return { ...JSON.parse(raw) } as Prefs;
  } catch {
    return { scanSound: true, scanVibrate: true, preferredCamera: "environment", compactCashier: false };
  }
}

function paymentLabel(method: string | null) {
  if (method === "CASH") return "Наличные";
  if (method === "CARD_TERMINAL") return "Карта";
  if (method === "CARD_ONLINE") return "Сайт";
  return "—";
}

export default function CashierProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<ProfileResponse>("/api/cashier/profile")
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : "Не удалось загрузить профиль");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function savePrefs(next: Prefs) {
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }

  async function onLogout() {
    setLoggingOut(true);
    try {
      await cashierLogout();
    } catch {
      /* ignore */
    }
    router.replace("/cashier/login");
  }

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordMsg(null);
    const form = new FormData(e.currentTarget);
    try {
      const result = await apiPost<{ ok: boolean; revokedOtherSessions: number }>(
        "/api/cashier/password",
        {
          currentPassword: String(form.get("currentPassword") ?? ""),
          newPassword: String(form.get("newPassword") ?? ""),
          confirmPassword: String(form.get("confirmPassword") ?? ""),
        },
      );
      setPasswordMsg(`Пароль обновлён. Отозвано других сессий: ${result.revokedOtherSessions}`);
      e.currentTarget.reset();
    } catch (err) {
      setPasswordError(err instanceof ApiClientError ? err.message : "Не удалось сменить пароль");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function revokeOthers() {
    setRevokeBusy(true);
    try {
      const result = await apiPost<{ revoked: number }>("/api/cashier/sessions/revoke-others", {});
      setPasswordMsg(`Завершено других сессий: ${result.revoked}`);
      setConfirmRevoke(false);
    } catch (err) {
      setPasswordError(err instanceof ApiClientError ? err.message : "Не удалось завершить сессии");
    } finally {
      setRevokeBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Профиль"
        description="Личные данные, собственная статистика продаж и безопасность."
      />

      {error ? <ErrorAlert message={error} /> : null}
      {!data && !error ? <div className="cashier-loading">Загрузка…</div> : null}

      {data ? (
        <>
          <section className="cashier-panel">
            <h2 className="cashier-section-title">Основная информация</h2>
            <dl className="cashier-profile-dl">
              <div>
                <dt>ФИО</dt>
                <dd>{data.profile.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{data.profile.email}</dd>
              </div>
              <div>
                <dt>Роль</dt>
                <dd>{labelRole(data.profile.role)}</dd>
              </div>
              <div>
                <dt>Статус</dt>
                <dd>
                  <StatusBadge
                    status={data.profile.status}
                    label={labelStatus(data.profile.status)}
                  />
                </dd>
              </div>
              <div>
                <dt>Локация</dt>
                <dd>
                  {data.profile.locations.map((l) => l.name).join(", ") || "Не назначена"}
                </dd>
              </div>
              <div>
                <dt>Создан</dt>
                <dd>{new Date(data.profile.createdAt).toLocaleString("ru-RU")}</dd>
              </div>
              <div>
                <dt>Последний вход</dt>
                <dd>
                  {data.profile.lastLoginAt
                    ? new Date(data.profile.lastLoginAt).toLocaleString("ru-RU")
                    : "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="cashier-panel">
            <h2 className="cashier-section-title">Моя статистика</h2>
            <div className="cashier-stat-grid">
              <div>
                <span>Сегодня</span>
                <strong>{formatMoneyFromKopecks(data.stats.todayRevenueKopecks)}</strong>
              </div>
              <div>
                <span>7 дней</span>
                <strong>{formatMoneyFromKopecks(data.stats.weekRevenueKopecks)}</strong>
              </div>
              <div>
                <span>Заказы (7д)</span>
                <strong>{data.stats.weekOrders}</strong>
              </div>
              <div>
                <span>Билеты (7д)</span>
                <strong>{data.stats.weekTickets}</strong>
              </div>
              <div>
                <span>Наличные</span>
                <strong>{formatMoneyFromKopecks(data.stats.cashKopecks)}</strong>
              </div>
              <div>
                <span>Карта</span>
                <strong>{formatMoneyFromKopecks(data.stats.cardKopecks)}</strong>
              </div>
              <div>
                <span>Сайт</span>
                <strong>{formatMoneyFromKopecks(data.stats.siteKopecks)}</strong>
              </div>
              <div>
                <span>Средний чек</span>
                <strong>{formatMoneyFromKopecks(data.stats.averageOrderValueKopecks)}</strong>
              </div>
              <div>
                <span>Check-in (7д)</span>
                <strong>{data.stats.checkInsWeek}</strong>
              </div>
            </div>
          </section>

          <section className="cashier-panel">
            <h2 className="cashier-section-title">История продаж</h2>
            <div className="cashier-table-wrap">
              <table className="cashier-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Заказ</th>
                    <th>Сеанс</th>
                    <th>Оплата</th>
                    <th>Билеты</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{new Date(sale.createdAt).toLocaleString("ru-RU")}</td>
                      <td>{sale.number}</td>
                      <td>{new Date(sale.sessionStartsAt).toLocaleString("ru-RU")}</td>
                      <td>{paymentLabel(sale.paymentMethod)}</td>
                      <td>{sale.ticketCount}</td>
                      <td>{formatMoneyFromKopecks(sale.totalAmount)}</td>
                      <td>{sale.status}</td>
                    </tr>
                  ))}
                  {!data.sales.length ? (
                    <tr>
                      <td colSpan={7}>Продаж пока нет</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="cashier-panel">
            <h2 className="cashier-section-title">Безопасность</h2>
            <form className="cashier-form" onSubmit={onPassword}>
              <label htmlFor="currentPassword">
                Текущий пароль
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <label htmlFor="newPassword">
                Новый пароль (мин. 10 символов)
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
              </label>
              <label htmlFor="confirmPassword">
                Повтор нового пароля
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
              </label>
              {passwordError ? <ErrorAlert message={passwordError} /> : null}
              {passwordMsg ? <div className="internal-alert info">{passwordMsg}</div> : null}
              <button type="submit" className="internal-btn primary" disabled={passwordBusy}>
                {passwordBusy ? "Сохранение…" : "Сменить пароль"}
              </button>
            </form>
            <div className="cashier-actions-row">
              <button
                type="button"
                className="internal-btn secondary"
                onClick={() => setConfirmRevoke(true)}
              >
                Завершить другие сессии
              </button>
              <button
                type="button"
                className="internal-btn secondary"
                onClick={onLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Выход…" : "Выйти из аккаунта"}
              </button>
            </div>
          </section>

          <ConfirmDialog
            open={confirmRevoke}
            title="Завершить другие сессии?"
            description="Текущая сессия останется активной. Остальные входы будут отозваны."
            confirmLabel="Завершить"
            danger
            busy={revokeBusy}
            onCancel={() => setConfirmRevoke(false)}
            onConfirm={() => void revokeOthers()}
          />

          <section className="cashier-panel">
            <h2 className="cashier-section-title">Настройки сканера и кассы</h2>
            <label className="cashier-check">
              <input
                type="checkbox"
                checked={prefs.scanSound}
                onChange={(e) => savePrefs({ ...prefs, scanSound: e.target.checked })}
              />
              Звук при сканировании
            </label>
            <label className="cashier-check">
              <input
                type="checkbox"
                checked={prefs.scanVibrate}
                onChange={(e) => savePrefs({ ...prefs, scanVibrate: e.target.checked })}
              />
              Вибрация
            </label>
            <label className="cashier-check">
              Камера по умолчанию
              <select
                value={prefs.preferredCamera}
                onChange={(e) =>
                  savePrefs({
                    ...prefs,
                    preferredCamera: e.target.value === "user" ? "user" : "environment",
                  })
                }
              >
                <option value="environment">Задняя</option>
                <option value="user">Передняя</option>
              </select>
            </label>
            <label className="cashier-check">
              <input
                type="checkbox"
                checked={prefs.compactCashier}
                onChange={(e) => savePrefs({ ...prefs, compactCashier: e.target.checked })}
              />
              Компактный режим кассы
            </label>
          </section>
        </>
      ) : null}
    </>
  );
}
