"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { ConfirmCheckbox } from "@/components/director/ConfirmCheckbox";
import { directorFetch, formatDateTime } from "@/lib/director/client";

type LocationOption = { id: string; name: string };
type SessionRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: string;
  _count: { tickets: number; orders: number };
};

export default function DirectorSessionsPage() {
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadSessions(selectedId: string) {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
    const data = await directorFetch<{ sessions: SessionRow[] }>(
      `/api/director/sessions?locationId=${selectedId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    setSessions(data.sessions);
  }

  useEffect(() => {
    directorFetch<{ locations: LocationOption[] }>("/api/director/locations")
      .then((data) => {
        setLocations(data.locations);
        if (data.locations[0]) {
          setLocationId(data.locations[0].id);
          return loadSessions(data.locations[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  useEffect(() => {
    if (!locationId) return;
    loadSessions(locationId).catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, [locationId]);

  async function generate() {
    if (!locationId || !confirmGenerate) return;
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const result = await directorFetch<{ created: number; skippedExisting: number; windowDays: number }>(
        "/api/director/sessions/generate",
        { method: "POST", body: JSON.stringify({ locationId }) },
      );
      setMessage(`Создано ${result.created}, пропущено ${result.skippedExisting} (окно ${result.windowDays} дн.)`);
      await loadSessions(locationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка генерации");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Sessions"
        description="Сеансы на ближайшие недели и rolling generation из расписания."
        actions={
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}
      {message ? <div className="director-alert success">{message}</div> : null}

      <section className="director-panel" style={{ marginBottom: 18 }}>
        <div className="director-panel-head">
          <h2>Генерация сеансов</h2>
        </div>
        <div style={{ padding: 18 }}>
          <ConfirmCheckbox
            checked={confirmGenerate}
            onChange={setConfirmGenerate}
            label="Подтверждаю генерацию сеансов на rolling window (существующие startsAt не перезаписываются)."
          />
          <button
            type="button"
            className="director-btn primary"
            disabled={!confirmGenerate || generating || !locationId}
            onClick={generate}
          >
            {generating ? "Генерация…" : "Сгенерировать"}
          </button>
        </div>
      </section>

      <section className="director-panel">
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Начало</th>
                <th>Окончание</th>
                <th>Статус</th>
                <th>Capacity</th>
                <th>Orders</th>
                <th>Tickets</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>{formatDateTime(session.startsAt)}</td>
                  <td>{formatDateTime(session.endsAt)}</td>
                  <td>
                    <span className="director-badge neutral">{session.status}</span>
                  </td>
                  <td>{session.capacity}</td>
                  <td>{session._count.orders}</td>
                  <td>{session._count.tickets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
