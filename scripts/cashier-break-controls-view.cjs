"use strict";

function CashierBreakControls({ React, jsx, controls, shiftId, refresh, sessions, selectSession, canSell }) {
  const [pending, setPending] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const saving = React.useRef(false);
  if (!controls?.slots?.length || !shiftId) return null;

  async function update(slot) {
    if (saving.current) return;
    saving.current = true;
    setPending(slot.time);
    setMessage("");
    try {
      const response = await fetch("/api/cashier/shift/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setCashierBreak", shiftId, date: controls.date, time: slot.time, open: !slot.open,
        }),
        signal: AbortSignal.timeout(12000),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || "Не удалось изменить перерыв");
      }
      setMessage(slot.open ? "Перерыв возвращён" : "Сеанс открыт для продаж на кассе");
    } catch (error) {
      setMessage(error.message || "Не удалось изменить перерыв");
    } finally {
      try { await refresh(); } catch {}
      saving.current = false;
      setPending(null);
    }
  }

  const h = jsx.jsx;
  return jsx.jsxs("section", {
    "aria-label": "Перерывы сегодня",
    className: "cashier-ops-card no-print",
    style: { padding: 14, marginBottom: 12, border: "1px solid #eccb81", borderRadius: 12, background: "#fff4da" },
    children: [
      h("h2", { className: "font-display text-xl font-semibold text-forest", children: "Перерывы сегодня" }),
      h("div", {
        style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
        children: controls.slots.map((slot) => jsx.jsxs("div", {
          style: { flex: "1 1 220px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
          children: [
            jsx.jsxs("div", { children: [
              h("strong", { children: slot.label }),
              h("div", {
                style: { fontSize: 13, color: "#5c4b2e" },
                children: slot.canToggle
                  ? (slot.open ? "Продажа открыта на кассе" : "Перерыв действует")
                  : slot.unavailableReason,
              }),
            ] }),
            slot.open && sessions?.some((session) => session.localTime === slot.time && canSell(session))
              ? h("button", {
                type: "button", className: "cashier-btn cashier-btn-primary",
                disabled: pending !== null,
                onClick: () => selectSession(sessions.find((session) => session.localTime === slot.time)),
                children: "Выбрать " + slot.time,
              }) : null,
            slot.canToggle ? h("button", {
              type: "button",
              className: "cashier-btn cashier-btn-ghost",
              style: { minHeight: 44 },
              disabled: pending !== null,
              "aria-label": (slot.open ? "Вернуть перерыв " : "Отменить перерыв ") + slot.label,
              onClick: () => update(slot),
              children: pending === slot.time ? "Сохраняем…" : (slot.open ? "Вернуть перерыв" : "Отменить перерыв"),
            }) : null,
          ],
        }, slot.time)),
      }),
      message ? h("p", { role: "status", style: { margin: "8px 0 0" }, children: message }) : null,
    ],
  });
}

module.exports = { CashierBreakControls };
