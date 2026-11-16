"use strict";

function TicketCorrection({ React, jsx, order, refresh, money }) {
  const [ticketId, setTicketId] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const [originalDocument, setOriginal] = React.useState("");
  const [correctionDocument, setCorrection] = React.useState("");
  const [settled, setSettled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const processing = React.useRef(false);
  const tickets = order.tickets.filter((ticket) => ticket.canCorrect);
  if (!tickets.length && !message) return null;

  async function request(action) {
    if (processing.current || !ticketId) return;
    processing.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/cashier/orders/" + encodeURIComponent(order.number), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify(action === "preview" ? { action, ticketId } : {
          action, ticketId, version: preview.version, originalDocument: originalDocument.trim(),
          correctionDocument: correctionDocument.trim(), settled,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Не удалось исправить билет.");
      if (action === "preview") setPreview(payload.data);
      else {
        setMessage("Билет исправлен. Проверьте новый тип в заказе.");
        setPreview(null);
        setTicketId("");
        setOriginal("");
        setCorrection("");
        setSettled(false);
        await refresh(order.number);
      }
    } catch (err) {
      setError(err.message || "Не удалось обработать исправление.");
    } finally {
      processing.current = false;
      setBusy(false);
    }
  }

  const h = jsx.jsx;
  const button = (label, onClick, disabled, primary) => h("button", {
    type: "button", disabled, onClick,
    className: "cashier-btn " + (primary ? "cashier-btn-primary" : "cashier-btn-ghost"),
    children: label,
  });
  const renderInput = (label, value, change) => jsx.jsxs("label", {
    style: { display: "grid", gap: 4 },
    children: [label, h("input", {
      type: "text", pattern: "[0-9]{16}/[0-9]{1,10}", placeholder: "ФН/ФД",
      value, maxLength: 27, disabled: busy,
      onChange: (event) => change(event.target.value),
    })],
  });
  const isReference = (s) => /^[0-9]{16}\/[0-9]{1,10}$/.test(s.trim());
  return jsx.jsxs("section", {
    className: "cashier-panel no-print", "aria-label": "Исправить билет",
    style: { margin: "12px 0", display: "grid", gap: 8, padding: 12 },
    children: [
      h("h2", { className: "font-display text-xl font-semibold text-forest", children: "Исправить билет" }),
      tickets.length ? jsx.jsxs("div", {
        style: { display: "flex", flexWrap: "wrap", gap: 8 },
        children: [
          h("select", {
            "aria-label": "Билет для исправления", disabled: busy, value: ticketId,
            onChange: (event) => {
              setTicketId(event.target.value);
              setPreview(null);
              setOriginal("");
              setCorrection("");
              setSettled(false);
              setError("");
              setMessage("");
            },
            children: [h("option", { value: "", children: "Выберите билет" }, "none"),
              ...tickets.map((ticket, index) => h("option", {
                value: ticket.publicId,
                children: (index + 1) + ". " + ticket.ticketTypeName + " · " + ticket.publicId.slice(-6),
              }, ticket.publicId))],
          }),
          button("Рассчитать замену", () => request("preview"), busy || !ticketId || Boolean(preview), false),
        ],
      }) : null,
      preview ? jsx.jsxs("div", {
        style: { display: "grid", gap: 8 },
        children: [
          h("p", { children: preview.before + " → " + preview.after + " · " +
            money(preview.oldAmount) + " → " + money(preview.newAmount) }),
          h("strong", { children: preview.delta === 0 ? "Цена без изменений" :
            (preview.delta > 0 ? "К доплате " : "К возврату ") + money(Math.abs(preview.delta)) +
            (preview.paymentMethod === "CASH" ? " наличными" : " по карте") }),
          h("p", { children: "Оформите исправление на Эвоторе и укажите ФН и ФД с чеков через косую черту." }),
          renderInput("Исходный чек", originalDocument, setOriginal),
          renderInput("Чек с исправлением", correctionDocument, setCorrection),
          jsx.jsxs("label", { children: [
            h("input", { type: "checkbox", checked: settled, disabled: busy,
              onChange: (event) => setSettled(event.target.checked) }),
            " Исправление и расчёт с гостем проведены",
          ] }),
          button("Сохранить исправление", () => request("confirm"),
            busy || !settled || !isReference(originalDocument) || !isReference(correctionDocument) ||
              originalDocument.trim() === correctionDocument.trim(), true),
        ],
      }) : null,
      error ? h("p", { role: "alert", className: "cashier-error", children: error }) : null,
      message ? h("p", { role: "status", children: message }) : null,
    ],
  });
}

module.exports = { TicketCorrection };
