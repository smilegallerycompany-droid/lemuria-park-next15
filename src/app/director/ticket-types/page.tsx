"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch } from "@/lib/director/client";
import { labelActive } from "@/lib/director/labels";

type TicketTypeRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isFree: boolean;
  _count: { priceRules: number; tickets: number };
};

export default function DirectorTicketTypesPage() {
  const [ticketTypes, setTicketTypes] = useState<TicketTypeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", name: "", description: "" });

  async function load() {
    const data = await directorFetch<{ ticketTypes: TicketTypeRow[] }>("/api/director/ticket-types");
    setTicketTypes(data.ticketTypes);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  async function createType() {
    setError(null);
    try {
      await directorFetch("/api/director/ticket-types", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          description: form.description || null,
        }),
      });
      setForm({ code: "", name: "", description: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать");
    }
  }

  async function toggleActive(row: TicketTypeRow) {
    try {
      await directorFetch(`/api/director/ticket-types/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <>
      <PageHeader title="Типы билетов" description="Справочник типов билетов для цен и заказов." />
      {error ? <div className="director-alert error">{error}</div> : null}

      <section className="director-panel" style={{ marginBottom: 18 }}>
        <div className="director-form-grid">
          <div className="director-field">
            <label>Код</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="director-field">
            <label>Название</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="director-field">
            <label>Описание</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <div style={{ padding: "0 18px 18px" }}>
          <button type="button" className="director-btn primary" onClick={createType}>
            Добавить тип
          </button>
        </div>
      </section>

      <section className="director-panel">
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Название</th>
                <th>Цены</th>
                <th>Билеты</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ticketTypes.map((row) => (
                <tr key={row.id}>
                  <td>{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row._count.priceRules}</td>
                  <td>{row._count.tickets}</td>
                  <td>
                    <span className={`director-badge ${row.isActive ? "green" : "neutral"}`}>
                      {labelActive(row.isActive)}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="director-btn secondary" onClick={() => toggleActive(row)}>
                      {row.isActive ? "Выключить" : "Включить"}
                    </button>
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
