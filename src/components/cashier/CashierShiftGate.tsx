"use client";

import { useEffect, useState } from "react";
import { formatMoneyFromKopecks } from "@/lib/utils";
import { ApiClientError } from "@/lib/api/client";
import { apiGet, apiPost, apiPatch } from "@/lib/api/client";

type ShiftPayload = {
  shift: null | {
    id: string;
    publicId: string;
    status: string;
    openedAt: string;
    openingCashAmount: number;
    cashSalesAmount: number;
    cardSalesAmount: number;
    onlineSalesAmount: number;
    ordersCount: number;
    ticketsCount: number;
    expectedCashAmount: number;
    cashIn: number;
    cashOut: number;
    cashRefunds: number;
    location: { id: string; name: string; city: string };
    user: { name: string };
  };
};

type LocationRow = { id: string; name: string; city: string };

export function CashierShiftGate({
  children,
  onShiftChange,
}: {
  children: React.ReactNode;
  onShiftChange?: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShiftPayload | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [openingCash, setOpeningCash] = useState("0");
  const [notes, setNotes] = useState("");
  const [locationId, setLocationId] = useState("");
  const [closing, setClosing] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const payload = await apiGet<ShiftPayload>("/api/cashier/shift");
    setData(payload);
    onShiftChange?.(Boolean(payload.shift));
  }

  useEffect(() => {
    (async () => {
      try {
        await reload();
        const locs = await apiGet<{ locations: LocationRow[] }>("/api/cashier/locations");
        setLocations(locs.locations);
        if (locs.locations[0]) setLocationId(locs.locations[0].id);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Ошибка смены");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openShift() {
    setBusy(true);
    setError(null);
    try {
      const rub = Number(openingCash.replace(",", "."));
      const kopecks = Math.round((Number.isFinite(rub) ? rub : 0) * 100);
      await apiPost("/api/cashier/shift", {
        locationId,
        openingCashAmount: kopecks,
        notes: notes || null,
      });
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Не удалось открыть смену");
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    setBusy(true);
    setError(null);
    try {
      const rub = Number(closingCash.replace(",", "."));
      const kopecks = Math.round((Number.isFinite(rub) ? rub : 0) * 100);
      await apiPatch("/api/cashier/shift", {
        closingCashAmount: kopecks,
        notes: closeNotes || null,
      });
      setClosing(false);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Не удалось закрыть смену");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="cashier-empty">Загрузка смены…</div>;

  if (!data?.shift) {
    return (
      <div className="cashier-shift-open">
        <h1>Открыть смену</h1>
        <p>Перед продажами нужно открыть кассовую смену.</p>
        {error ? <div className="director-alert error">{error}</div> : null}
        <label>
          Локация
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.city} — {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Наличные в кассе на начало (₽)
          <input value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Комментарий
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button type="button" className="director-btn primary" disabled={busy || !locationId} onClick={openShift}>
          {busy ? "Открываем…" : "Открыть смену"}
        </button>
      </div>
    );
  }

  const shift = data.shift;
  const opened = new Date(shift.openedAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <div className="cashier-shift-bar">
        <div>
          <strong>Смена открыта</strong>
          <span>
            {shift.location.city} · с {opened}
          </span>
        </div>
        <div className="tabular-nums">
          Наличные: {formatMoneyFromKopecks(shift.openingCashAmount + shift.cashSalesAmount + shift.cashIn - shift.cashOut - shift.cashRefunds)}
        </div>
        <div>
          Продажи: {shift.ordersCount} · Билеты: {shift.ticketsCount}
        </div>
        <button type="button" className="director-btn secondary" onClick={() => {
          setClosing(true);
          setClosingCash(String((shift.expectedCashAmount / 100).toFixed(2)));
        }}>
          Закрыть смену
        </button>
      </div>
      {error ? <div className="director-alert error">{error}</div> : null}
      {closing ? (
        <div className="cashier-shift-close">
          <h2>Закрытие смены</h2>
          <ul>
            <li>Наличные продажи: {formatMoneyFromKopecks(shift.cashSalesAmount)}</li>
            <li>Карта: {formatMoneyFromKopecks(shift.cardSalesAmount)}</li>
            <li>Онлайн: {formatMoneyFromKopecks(shift.onlineSalesAmount)}</li>
            <li>Заказов: {shift.ordersCount}</li>
            <li>Билетов: {shift.ticketsCount}</li>
            <li>Возвратов (cash): {formatMoneyFromKopecks(shift.cashRefunds)}</li>
            <li>
              <strong>Ожидается в кассе: {formatMoneyFromKopecks(shift.expectedCashAmount)}</strong>
            </li>
          </ul>
          <label>
            Фактически в кассе (₽)
            <input value={closingCash} onChange={(e) => setClosingCash(e.target.value)} inputMode="decimal" />
          </label>
          {(() => {
            const actual = Math.round(Number(closingCash.replace(",", ".")) * 100);
            const diff = actual - shift.expectedCashAmount;
            if (!Number.isFinite(actual)) return null;
            if (diff === 0) return <p className="diff ok">Сходится</p>;
            if (diff < 0) return <p className="diff shortage">Недостача {formatMoneyFromKopecks(Math.abs(diff))}</p>;
            return <p className="diff overage">Излишек {formatMoneyFromKopecks(diff)}</p>;
          })()}
          <label>
            Комментарий (обязателен при расхождении)
            <input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="director-btn primary" disabled={busy} onClick={closeShift}>
              Подтвердить закрытие
            </button>
            <button type="button" className="director-btn secondary" onClick={() => setClosing(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        children
      )}
    </>
  );
}
