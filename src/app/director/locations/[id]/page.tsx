"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch } from "@/lib/director/client";

type LocationDetail = {
  id: string;
  slug: string;
  name: string;
  city: string;
  address: string;
  status: string;
  timezone: string;
  defaultCapacity: number;
  sessionIntervalMinutes: number;
  visitDurationMinutes: number;
  phone: string | null;
  email: string | null;
  workingHoursText: string | null;
  siteHeadline: string | null;
  siteDescription: string | null;
};

export default function DirectorLocationDetailPage() {
  const params = useParams<{ id: string }>();
  const [location, setLocation] = useState<LocationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    directorFetch<{ location: LocationDetail }>(`/api/director/locations/${params.id}`)
      .then((data) => setLocation(data.location))
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, [params.id]);

  async function save() {
    if (!location) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const data = await directorFetch<{ location: LocationDetail }>(`/api/director/locations/${location.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: location.name,
          city: location.city,
          address: location.address,
          status: location.status,
          defaultCapacity: location.defaultCapacity,
          sessionIntervalMinutes: location.sessionIntervalMinutes,
          visitDurationMinutes: location.visitDurationMinutes,
          phone: location.phone,
          email: location.email,
          workingHoursText: location.workingHoursText,
          siteHeadline: location.siteHeadline,
          siteDescription: location.siteDescription,
        }),
      });
      setLocation(data.location);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  if (!location && !error) {
    return <div className="director-empty">Загрузка…</div>;
  }

  if (!location) {
    return <div className="director-alert error">{error}</div>;
  }

  return (
    <>
      <PageHeader
        title={location.name}
        description={`${location.city} · ${location.slug}`}
        actions={
          <button type="button" className="director-btn primary" disabled={saving} onClick={save}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}
      {saved ? <div className="director-alert success">Изменения сохранены</div> : null}

      <section className="director-panel">
        <div className="director-form-grid">
          <div className="director-field">
            <label>Статус</label>
            <select
              value={location.status}
              onChange={(e) => setLocation({ ...location, status: e.target.value })}
            >
              {["UPCOMING", "ACTIVE", "PAUSED", "CLOSED"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="director-field">
            <label>Timezone</label>
            <input value={location.timezone} readOnly />
          </div>
          <div className="director-field">
            <label>Ёмкость по умолчанию</label>
            <input
              type="number"
              value={location.defaultCapacity}
              onChange={(e) => setLocation({ ...location, defaultCapacity: Number(e.target.value) })}
            />
          </div>
          <div className="director-field">
            <label>Интервал сеансов (мин)</label>
            <input
              type="number"
              value={location.sessionIntervalMinutes}
              onChange={(e) => setLocation({ ...location, sessionIntervalMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="director-field">
            <label>Длительность визита (мин)</label>
            <input
              type="number"
              value={location.visitDurationMinutes}
              onChange={(e) => setLocation({ ...location, visitDurationMinutes: Number(e.target.value) })}
            />
          </div>
          <div className="director-field">
            <label>Телефон</label>
            <input value={location.phone ?? ""} onChange={(e) => setLocation({ ...location, phone: e.target.value })} />
          </div>
          <div className="director-field">
            <label>Email</label>
            <input value={location.email ?? ""} onChange={(e) => setLocation({ ...location, email: e.target.value })} />
          </div>
          <div className="director-field" style={{ gridColumn: "1 / -1" }}>
            <label>Адрес</label>
            <input value={location.address} onChange={(e) => setLocation({ ...location, address: e.target.value })} />
          </div>
          <div className="director-field" style={{ gridColumn: "1 / -1" }}>
            <label>Заголовок на сайте</label>
            <input
              value={location.siteHeadline ?? ""}
              onChange={(e) => setLocation({ ...location, siteHeadline: e.target.value })}
            />
          </div>
          <div className="director-field" style={{ gridColumn: "1 / -1" }}>
            <label>Описание на сайте</label>
            <textarea
              value={location.siteDescription ?? ""}
              onChange={(e) => setLocation({ ...location, siteDescription: e.target.value })}
            />
          </div>
        </div>
      </section>
    </>
  );
}
