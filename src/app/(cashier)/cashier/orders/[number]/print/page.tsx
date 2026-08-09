"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatMoneyFromKopecks } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/api/client";

type PrintOrder = {
  number: string;
  status: string;
  customerName: string;
  totalAmount: number;
  locationName: string;
  sessionDate: string;
  sessionTime: string;
  items: Array<{ ticketTypeName: string; quantity: number; subtotalAmount: number }>;
  tickets: Array<{ publicId: string; qrToken: string; ticketTypeName: string }>;
};

export default function CashierOrderPrintPage() {
  const params = useParams<{ number: string }>();
  const [order, setOrder] = useState<PrintOrder | null>(null);

  useEffect(() => {
    (async () => {
      const data = await apiGet<{ order: PrintOrder }>(`/api/cashier/orders/${params.number}`);
      setOrder(data.order);
      await apiPost(`/api/cashier/orders/${params.number}/print`, {
        note: "browser-print",
      }).catch(() => undefined);
      setTimeout(() => window.print(), 350);
    })().catch(() => undefined);
  }, [params.number]);

  if (!order) return <div style={{ padding: 24 }}>Загрузка…</div>;

  return (
    <main className="print-only-page">
      <style>{`
        .print-only-page { max-width: 720px; margin: 24px auto; font-family: system-ui, sans-serif; color: #14301e; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
        .qr { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
        @media print {
          .cashier-topbar, .cashier-nav, .cashier-bottom-nav, .no-print { display: none !important; }
        }
      `}</style>
      <p className="no-print">
        <button type="button" onClick={() => window.print()}>
          Печать
        </button>
      </p>
      <p>Лемурия Парк</p>
      <h1>Заказ {order.number}</h1>
      <p>{order.locationName}</p>
      <p>
        Сеанс: {order.sessionDate} {order.sessionTime}
        <br />
        Клиент: {order.customerName}
        <br />
        Сумма: {formatMoneyFromKopecks(order.totalAmount)} · {order.status}
      </p>
      <table>
        <thead>
          <tr>
            <th>Тип</th>
            <th>Qty</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.ticketTypeName}>
              <td>{item.ticketTypeName}</td>
              <td>{item.quantity}</td>
              <td>{formatMoneyFromKopecks(item.subtotalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Билеты / QR</h2>
      <ul>
        {order.tickets.map((t) => (
          <li key={t.publicId}>
            <strong>
              {t.ticketTypeName} · {t.publicId}
            </strong>
            <div className="qr">{t.qrToken}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
