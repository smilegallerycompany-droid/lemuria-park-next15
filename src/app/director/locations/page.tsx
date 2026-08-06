"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch } from "@/lib/director/client";
import { labelStatus } from "@/lib/director/labels";

type LocationRow = {
  id: string;
  slug: string;
  name: string;
  city: string;
  status: string;
  defaultCapacity: number;
  _count: { sessions: number; orders: number };
};

export default function DirectorLocationsPage() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    name: "",
    city: "",
    address: "",
  });

  async function load() {
    const data = await directorFetch<{ locations: LocationRow[] }>("/api/director/locations");
    setLocations(data.locations);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  async function createLocation() {
    setCreating(true);
    setError(null);
    try {
      await directorFetch("/api/director/locations", {
        method: "POST",
        body: JSON.stringify({ ...form, status: "UPCOMING" }),
      });
      setForm({ slug: "", name: "", city: "", address: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader title="Локации" description="Локации парка, статус и базовые параметры сеансов." />
      {error ? <div className="director-alert error">{error}</div> : null}

      <section className="director-panel" style={{ marginBottom: 18 }}>
        <div className="director-panel-head">
          <h2>Новая локация</h2>
        </div>
        <div className="director-form-grid">
          <div className="director-field">
            <label>Код (slug)</label>
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
          <div className="director-field">
            <label>Название</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="director-field">
            <label>Город</label>
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="director-field">
            <label>Адрес</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <div style={{ padding: "0 18px 18px" }}>
          <button type="button" className="director-btn primary" disabled={creating} onClick={createLocation}>
            Создать
          </button>
        </div>
      </section>

      <section className="director-panel">
        <div className="director-panel-head">
          <h2>Список</h2>
        </div>
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Город</th>
                <th>Статус</th>
                <th>Сеансы</th>
                <th>Заказы</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => (
                <tr key={location.id}>
                  <td>
                    <strong>{location.name}</strong>
                    <div style={{ color: "var(--dir-muted)", fontSize: 12 }}>{location.slug}</div>
                  </td>
                  <td>{location.city}</td>
                  <td>
                    <span className="director-badge green">{labelStatus(location.status)}</span>
                  </td>
                  <td>{location._count.sessions}</td>
                  <td>{location._count.orders}</td>
                  <td>
                    <Link href={`/director/locations/${location.id}`} className="director-link">
                      Открыть
                    </Link>
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
