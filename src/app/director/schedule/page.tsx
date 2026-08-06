"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { DAY_LABELS, WEEK_DAYS, directorFetch } from "@/lib/director/client";

type LocationOption = { id: string; name: string };
type ScheduleRow = {
  dayOfWeek: string;
  opensAt: string;
  closesAt: string;
  sessionIntervalMinutes: number | null;
  isClosed: boolean;
};

const DEFAULT_ROWS: ScheduleRow[] = WEEK_DAYS.map((day) => ({
  dayOfWeek: day,
  opensAt: "10:00",
  closesAt: "20:00",
  sessionIntervalMinutes: null,
  isClosed: false,
}));

export default function DirectorSchedulePage() {
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [rows, setRows] = useState<ScheduleRow[]>(DEFAULT_ROWS);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    directorFetch<{ locations: LocationOption[] }>("/api/director/locations")
      .then((data) => {
        setLocations(data.locations);
        if (data.locations[0]) setLocationId(data.locations[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  useEffect(() => {
    if (!locationId) return;
    directorFetch<{ schedules: ScheduleRow[] }>(`/api/director/schedule?locationId=${locationId}`)
      .then((data) => {
        if (data.schedules.length === 0) {
          setRows(DEFAULT_ROWS);
          return;
        }
        const byDay = new Map(data.schedules.map((row) => [row.dayOfWeek, row]));
        setRows(
          WEEK_DAYS.map(
            (day) =>
              byDay.get(day) ?? {
                dayOfWeek: day,
                opensAt: "10:00",
                closesAt: "20:00",
                sessionIntervalMinutes: null,
                isClosed: false,
              },
          ),
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, [locationId]);

  const locationName = useMemo(
    () => locations.find((item) => item.id === locationId)?.name ?? "",
    [locations, locationId],
  );

  function updateRow(index: number, patch: Partial<ScheduleRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    if (!locationId) return;
    setLoading(true);
    setSaved(false);
    setError(null);
    try {
      await directorFetch("/api/director/schedule", {
        method: "PUT",
        body: JSON.stringify({ locationId, days: rows }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Расписание"
        description="Недельное расписание локации (основа генерации сеансов)."
        actions={
          <>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
            <button type="button" className="director-btn primary" disabled={loading || !locationId} onClick={save}>
              Сохранить
            </button>
          </>
        }
      />
      {locationName ? <p style={{ color: "var(--dir-muted)", marginTop: -8 }}>{locationName}</p> : null}
      {error ? <div className="director-alert error">{error}</div> : null}
      {saved ? <div className="director-alert success">Расписание обновлено</div> : null}

      <section className="director-panel">
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>День</th>
                <th>Открытие</th>
                <th>Закрытие</th>
                <th>Интервал</th>
                <th>Выходной</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.dayOfWeek}>
                  <td>{DAY_LABELS[row.dayOfWeek] ?? row.dayOfWeek}</td>
                  <td>
                    <input value={row.opensAt} onChange={(e) => updateRow(index, { opensAt: e.target.value })} />
                  </td>
                  <td>
                    <input value={row.closesAt} onChange={(e) => updateRow(index, { closesAt: e.target.value })} />
                  </td>
                  <td>
                    <input
                      type="number"
                      placeholder="по умолч."
                      value={row.sessionIntervalMinutes ?? ""}
                      onChange={(e) =>
                        updateRow(index, {
                          sessionIntervalMinutes: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.isClosed}
                      onChange={(e) => updateRow(index, { isClosed: e.target.checked })}
                    />
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
