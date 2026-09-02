"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch } from "@/lib/director/client";
import { labelStatus } from "@/lib/director/labels";
import { WhereWeAreSection, type PublicLocationCard } from "@/components/public/WhereWeAreSection";

type LocationDetail = {
  id: string;
  slug: string;
  name: string;
  city: string;
  address: string;
  addressLine2: string | null;
  status: string;
  timezone: string;
  defaultCapacity: number;
  sessionIntervalMinutes: number;
  visitDurationMinutes: number;
  phone: string | null;
  email: string | null;
  mapUrl: string | null;
  routeUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  mapZoom: number;
  mapLabel: string | null;
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
      const data = await directorFetch<{ location: LocationDetail }>(
        `/api/director/locations/${location.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: location.name,
            city: location.city,
            address: location.address,
            addressLine2: location.addressLine2,
            status: location.status,
            defaultCapacity: location.defaultCapacity,
            sessionIntervalMinutes: location.sessionIntervalMinutes,
            visitDurationMinutes: location.visitDurationMinutes,
            phone: location.phone,
            email: location.email,
            mapUrl: location.mapUrl,
            routeUrl: location.routeUrl,
            latitude: location.latitude,
            longitude: location.longitude,
            mapZoom: location.mapZoom,
            mapLabel: location.mapLabel,
          }),
        },
      );
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

  const preview: PublicLocationCard = {
    slug: location.slug,
    name: location.name,
    city: location.city,
    address: location.address,
    addressLine2: location.addressLine2,
    phone: location.phone,
    email: location.email,
    latitude: location.latitude,
    longitude: location.longitude,
    mapZoom: location.mapZoom ?? 16,
    mapLabel: location.mapLabel,
    routeUrl: location.routeUrl,
    mapUrl: location.mapUrl,
    scheduleSummary: "Пн–Вс · по расписанию сеансов",
    nextSessions: [],
  };

  return (
    <>
      <PageHeader
        title={location.name}
        description="Публичная локация, карта и маршрут"
        actions={
          <button type="button" className="director-btn" onClick={save} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}
      {saved ? <div className="director-alert success">Сохранено</div> : null}

      <div className="director-grid-2">
        <section className="director-card" style={{ padding: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Основные данные</h2>
          {(
            [
              ["name", "Название"],
              ["city", "Город"],
              ["address", "Адрес"],
              ["addressLine2", "Ориентир / этаж"],
              ["phone", "Телефон"],
              ["email", "Эл. почта"],
              ["mapLabel", "Подпись на карте"],
              ["routeUrl", "URL маршрута"],
              ["mapUrl", "Ссылка на карту"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="director-field">
              {label}
              <input
                value={(location[key] as string | null) ?? ""}
                onChange={(e) => setLocation({ ...location, [key]: e.target.value || null })}
              />
            </label>
          ))}
          <label className="director-field">
            Статус
            <select
              value={location.status}
              onChange={(e) => setLocation({ ...location, status: e.target.value })}
            >
              {["UPCOMING", "ACTIVE", "PAUSED", "CLOSED"].map((s) => (
                <option key={s} value={s}>
                  {labelStatus(s)}
                </option>
              ))}
            </select>
          </label>
          <div className="director-grid-2">
            <label className="director-field">
              Широта
              <input
                type="number"
                step="any"
                value={location.latitude ?? ""}
                onChange={(e) =>
                  setLocation({
                    ...location,
                    latitude: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="director-field">
              Долгота
              <input
                type="number"
                step="any"
                value={location.longitude ?? ""}
                onChange={(e) =>
                  setLocation({
                    ...location,
                    longitude: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label className="director-field">
            Масштаб карты
            <input
              type="number"
              min={1}
              max={21}
              value={location.mapZoom ?? 16}
              onChange={(e) => setLocation({ ...location, mapZoom: Number(e.target.value) })}
            />
          </label>
        </section>

        <section className="director-card public-awwwards" style={{ padding: 8, overflow: "hidden" }}>
          <h2 style={{ margin: "12px 16px", fontSize: 16 }}>Как будет выглядеть на сайте</h2>
          <WhereWeAreSection sectionTitle="Где мы находимся?" locations={[preview]} />
        </section>
      </div>
    </>
  );
}
