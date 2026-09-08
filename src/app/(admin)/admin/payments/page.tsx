"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/internal";
import { directorFetch } from "@/lib/director/client";
import { labelStatus, labelPaymentMethod } from "@/lib/director/labels";

type Payment = {
  id: string;
  amount: number;
  method: string;
  status: string;
  provider: string | null;
  providerPaymentId: string | null;
  createdAt: string;
  order: { number: string; location: { name: string; city: string } | null };
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  useEffect(() => {
    directorFetch<{ payments: Payment[] }>("/api/admin/payments")
      .then((d) => setPayments(d.payments))
      .catch(() => undefined);
  }, []);

  return (
    <div className="director-page">
      <PageHeader title="Платежи" description="Без секретов и номеров карт" />
      <div className="director-table-wrap">
        <table className="director-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Заказ</th>
              <th>Локация</th>
              <th>Провайдер</th>
              <th>Метод</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Номер у провайдера</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.createdAt).toLocaleString("ru-RU")}</td>
                <td>
                  <a href={`/admin/payments/${p.id}`}>{p.order.number}</a>
                </td>
                <td>{p.order.location?.city ?? "—"}</td>
                <td>{p.provider ?? "—"}</td>
                <td>{labelPaymentMethod(p.method)}</td>
                <td>{(p.amount / 100).toLocaleString("ru-RU")} ₽</td>
                <td>{labelStatus(p.status)}</td>
                <td>{p.providerPaymentId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
