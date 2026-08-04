"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch, formatDateTime } from "@/lib/director/client";

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
        title="Tickets"
        description="Выданные билеты и статусы check-in / refund."
        actions={
          <>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="publicId, order, QR" />
            <button type="button" className="director-btn secondary" onClick={() => load(search)}>
              Найти
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
                <th>Order</th>
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
                  <td>{ticket.order.number}</td>
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
