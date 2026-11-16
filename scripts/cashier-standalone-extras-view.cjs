"use strict";

function StandaloneExtras({ React, jsx, products, shiftId, refreshShift }) {
  const h = jsx.jsx;
  const list = (products ?? []).filter((product) =>
    ["FEED", "PHOTO"].includes(product.code) && product.unitPriceAmount > 0,
  );
  const [code, setCode] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [method, setMethod] = React.useState("CASH");
  const [pending, setPending] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState(null);
  const submitting = React.useRef(false);
  const current = list.find((product) => product.code === code);
  const units = Number(quantity);
  const valid = Boolean(current && Number.isInteger(units) && units > 0 && units <= 100);
  const storageKey = "lemuria-extras-sale:" + shiftId;
  const currency = new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: "RUB", maximumFractionDigits: 2,
  });

  React.useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved?.shiftId === shiftId && saved.id && ["FEED_SALE", "PHOTO_SALE"].includes(saved.kind)) {
        setCode(saved.kind === "FEED_SALE" ? "FEED" : "PHOTO");
        setQuantity(String(saved.quantity));
        setMethod(saved.method);
        setPending(saved);
      }
    } catch {}
  }, [shiftId, storageKey]);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current || (!pending && !valid)) return;
    const sale = pending ?? {
      id: crypto.randomUUID(),
      shiftId,
      kind: code === "FEED" ? "FEED_SALE" : "PHOTO_SALE",
      amountKopecks: current.unitPriceAmount * units,
      quantity: units,
      method,
      person: "",
      note: "Продажа без билета",
    };
    const clearPending = () => {
      try { sessionStorage.removeItem(storageKey); } catch {}
      setPending(null);
    };
    submitting.current = true;
    setBusy(true);
    setPending(sale);
    setMessage(null);
    try {
      try { sessionStorage.setItem(storageKey, JSON.stringify(sale)); } catch {}
      const response = await fetch("/api/cashier/shift/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sale),
        signal: AbortSignal.timeout(12000),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        if (payload?.error?.code === "PRICE_NOT_CONFIGURED" ||
            payload?.error?.code === "INVALID_TICKET_TYPE") clearPending();
        throw new Error(payload?.error?.message || "Не удалось подтвердить запись продажи.");
      }
      clearPending();
      setCode("");
      setQuantity("1");
      setMessage({ ok: true, text: "Продажа сохранена в отчёте смены." });
      Promise.resolve().then(refreshShift).catch(() => {});
    } catch (error) {
      setMessage({ ok: false, text: error?.message || "Не удалось подтвердить запись продажи." });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return jsx.jsxs("section", {
    "aria-label": "Корм и фото без билета",
    className: "cashier-ops-card no-print",
    style: { padding: 16, marginBottom: 16, background: "#eef4eb", borderRadius: 16, border: "1px solid #c7d7c1" },
    children: [
      h("h2", { className: "font-display text-xl font-semibold text-forest", children: "Корм и фото без билета" }),
      jsx.jsx("div", {
        className: "cashier-quick-actions",
        style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 },
        children: list.map((product) => h("button", {
          type: "button", disabled: Boolean(pending),
          "aria-pressed": code === product.code,
          className: "cashier-btn " + (code === product.code ? "cashier-btn-primary" : "cashier-btn-ghost"),
          onClick: () => { setCode(product.code); setQuantity("1"); setMessage(null); },
          children: (product.code === "FEED" ? "Корм" : "Фото") + " · " +
            currency.format(product.unitPriceAmount / 100),
        }, product.code)),
      }),
      (current || pending) ? jsx.jsxs("form", {
        onSubmit: submit, style: { display: "grid", gap: 10, marginTop: 12 },
        children: [
          jsx.jsxs("label", {
            children: ["Количество ", h("input", {
              type: "number", min: 1, max: 100, inputMode: "numeric", required: true,
              value: quantity, onChange: (event) => setQuantity(event.target.value),
              disabled: Boolean(pending), className: "border rounded-lg px-2 py-1",
            })],
          }),
          jsx.jsxs("label", {
            children: ["Оплата ", jsx.jsxs("select", {
              value: method, disabled: Boolean(pending),
              onChange: (event) => setMethod(event.target.value),
              className: "border rounded-lg px-2 py-1",
              children: [
                h("option", { value: "CASH", children: "Наличные" }),
                h("option", { value: "CARD", children: "Карта" }),
              ],
            })],
          }),
          h("strong", { children: "К оплате " + currency.format(
            (pending?.amountKopecks ?? (valid ? current.unitPriceAmount * units : 0)) / 100,
          ) }),
          pending && !busy ? h("p", { children: "Статус записи неизвестен. Повтор сохранит ту же продажу." }) : null,
          h("button", {
            type: "submit", disabled: busy || (!valid && !pending),
            className: "cashier-btn cashier-btn-primary",
            children: busy ? "Сохраняю…" : pending ? "Повторить проверку" :
              method === "CASH" ? "Наличные получены · сохранить" : "Оплата картой подтверждена · сохранить",
          }),
        ],
      }) : null,
      message ? h("p", { role: message.ok ? "status" : "alert", children: message.text }) : null,
    ],
  });
}

module.exports = { StandaloneExtras };
