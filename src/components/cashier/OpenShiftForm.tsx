"use client";

import { useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import { getCashierMe } from "@/lib/api/cashier";
import { useCashierShift } from "./CashierShiftProvider";
import { rublesToKopecks } from "./shift-types";

export function OpenShiftForm() {
  const { locations, openShift, error, clearError, loading } = useCashierShift();
  const [cashierName, setCashierName] = useState("Кассир");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [openingCash, setOpeningCash] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const loc = locationId || locations[0]?.id || "";
  const today = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  useEffect(() => {
    getCashierMe()
      .then((u) => setCashierName(u.name))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!locationId && locations[0]) setLocationId(locations[0].id);
  }, [locations, locationId]);

  async function onOpen() {
    const kopecks = rublesToKopecks(openingCash);
    if (!Number.isFinite(kopecks)) {
      setLocalError("Укажите сумму наличных на начало");
      return;
    }
    if (!loc) {
      setLocalError("Выберите локацию");
      return;
    }
    setBusy(true);
    setLocalError(null);
    clearError();
    try {
      await openShift({ locationId: loc, openingCashAmount: kopecks, notes });
    } catch (err) {
      setLocalError(err instanceof ApiClientError ? err.message : "Не удалось открыть смену");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cashier-shift-open" data-testid="open-shift-form">
      <h1>Открыть смену</h1>
      <p>Перед продажами нужно открыть кассовую смену.</p>
      {localError || error ? <div className="cashier-error">{localError || error}</div> : null}
      {!loading && locations.length === 0 ? (
        <div className="cashier-error">Не удалось загрузить локации. Обновите страницу.</div>
      ) : null}
      <label>
        Локация
        <select value={loc} onChange={(e) => setLocationId(e.target.value)} disabled={locations.length === 0}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.city} — {l.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Кассир
        <input value={cashierName} disabled readOnly />
      </label>
      <label>
        Дата
        <input value={today} disabled readOnly />
      </label>
      <label>
        Наличные в кассе на начало, ₽
        <input
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          inputMode="decimal"
          className="tabular-nums"
        />
      </label>
      <label>
        Комментарий
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button
        type="button"
        className="cashier-btn cashier-btn-primary"
        disabled={busy || !loc}
        onClick={() => void onOpen()}
      >
        {busy ? "Открываем…" : "Открыть смену"}
      </button>
    </div>
  );
}
