"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch, downloadCsv, formatDateTime } from "@/lib/director/client";
import { useStaffBasePath } from "@/lib/staff-portal";

type TicketRow = {
  publicId: string;
  status: string;
  holderLabel: string | null;
  createdAt: string;
  ticketType: { name: string; code: string };
  location: { name: string };
  session: { startsAt: string };
  order: { number: string; source: string };
};

export default function DirectorTicketsPage() {
  const base = useStaffBasePath();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(query = "") {
    const params = new URLSearchParams({ limit: "100" });
    if (query) params.set("search", query);
    const data = await directorFetch<{ tickets: TicketRow[] }>(`/api/director/tickets?${params}`);
    setTickets(data.tickets);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  return (
    <>
      <PageHeader
        title="Билеты"
        description="Выданные билеты и статусы check-in / refund."
        actions={
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="publicId, заказ, QR"
              aria-label="Поиск билетов"
            />
            <button type="button" className="director-btn secondary" onClick={() => load(search)}>
              Найти
            </button>
            <button
              type="button"
              className="director-btn secondary"
              onClick={() =>
                downloadCsv(
                  "tickets.csv",
                  tickets.map((ticket) => ({
                    publicId: ticket.publicId,
                    order: ticket.order.number,
                    status: ticket.status,
                    type: ticket.ticketType.name,
                    location: ticket.location.name,
                    createdAt: ticket.createdAt,
                  })),
                )
              }
              disabled={tickets.length === 0}
            >
              CSV
            </button>
          </>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}

      <section className="director-panel">
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Public ID</th>
                <th>Номер заказа</th>
                <th>Тип</th>
                <th>Локация</th>
                <th>Сеанс</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.publicId}>
                  <td>{ticket.publicId}</td>
                  <td>
                    <Link href={`${base}/orders/${ticket.order.number}`}>{ticket.order.number}</Link>
                  </td>
                  <td>{ticket.ticketType.name}</td>
                  <td>{ticket.location.name}</td>
                  <td>{formatDateTime(ticket.session.startsAt)}</td>
                  <td>
                    <span className="director-badge neutral">{ticket.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
