"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Phone, Clock3, Navigation } from "lucide-react";
import { LocationMap } from "@/components/public/LocationMap";
import { resolveRouteUrl, hasCoordinates } from "@/lib/maps/types";

export type PublicLocationCard = {
  slug: string;
  name: string;
  city: string;
  address: string;
  addressLine2: string | null;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  mapZoom: number;
  mapLabel: string | null;
  routeUrl: string | null;
  mapUrl: string | null;
  scheduleSummary: string | null;
  nextSessions: Array<{ localDate: string; localTime: string; remainingSeats: number }>;
};

type Props = {
  sectionTitle?: string;
  locations: PublicLocationCard[];
  initialSlug?: string;
};

export function WhereWeAreSection({
  sectionTitle = "Где мы находимся?",
  locations,
  initialSlug,
}: Props) {
  const [slug, setSlug] = useState(initialSlug ?? locations[0]?.slug ?? "");
  const location = useMemo(
    () => locations.find((l) => l.slug === slug) ?? locations[0] ?? null,
    [locations, slug],
  );

  useEffect(() => {
    if (!location && locations[0]) setSlug(locations[0].slug);
  }, [location, locations]);

  if (!location) return null;

  const route = resolveRouteUrl({
    latitude: location.latitude ?? 0,
    longitude: location.longitude ?? 0,
    address: [location.address, location.addressLine2].filter(Boolean).join(", "),
    routeUrl: location.routeUrl || location.mapUrl,
  });

  const title = location.mapLabel || location.name;

  return (
    <section id="location" className="section location-where container">
      <div className="section-head location-where-head">
        <div>
          <span className="kicker">Локация</span>
          <h2>{sectionTitle}</h2>
          <p className="location-where-sub">
            {title.includes(location.city) ? title : `${title} в ${location.city}`}
          </p>
        </div>
        {locations.length > 1 ? (
          <label className="location-switcher">
            <span>Локация</span>
            <select value={location.slug} onChange={(e) => setSlug(e.target.value)}>
              {locations.map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.city}, {l.mapLabel || l.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="location-where-grid">
        <div className="location-where-info">
          <h3>{location.mapLabel || "Лемурия Парк"}</h3>
          <p className="location-where-city">{location.city}</p>

          <div className="location-where-row">
            <MapPin size={18} aria-hidden />
            <div>
              <strong>Адрес</strong>
              <p>{location.address}</p>
              {location.addressLine2 ? <p>{location.addressLine2}</p> : null}
            </div>
          </div>

          {location.scheduleSummary ? (
            <div className="location-where-row">
              <Clock3 size={18} aria-hidden />
              <div>
                <strong>Режим работы</strong>
                <p>{location.scheduleSummary}</p>
              </div>
            </div>
          ) : null}

          {location.phone ? (
            <div className="location-where-row">
              <Phone size={18} aria-hidden />
              <div>
                <strong>Телефон</strong>
                <p>
                  <a href={`tel:${location.phone.replace(/[^\d+]/g, "")}`}>{location.phone}</a>
                </p>
              </div>
            </div>
          ) : null}

          {location.nextSessions.length > 0 ? (
            <div className="location-where-sessions">
              <strong>Ближайшие сеансы</strong>
              <ul>
                {location.nextSessions.slice(0, 4).map((s) => (
                  <li key={`${s.localDate}-${s.localTime}`}>
                    {s.localDate} · {s.localTime}
                    <span>свободно {s.remainingSeats}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="location-where-actions">
            <a className="button button-orange" href="#booking">
              Купить билет
            </a>
            {hasCoordinates(location) || location.routeUrl || location.mapUrl ? (
              <a className="button button-ghost" href={route} target="_blank" rel="noreferrer">
                <Navigation size={16} aria-hidden /> Построить маршрут
              </a>
            ) : null}
          </div>
        </div>

        <div className="location-where-map">
          {hasCoordinates(location) ? (
            <LocationMap
              key={location.slug}
              latitude={location.latitude!}
              longitude={location.longitude!}
              zoom={location.mapZoom}
              title={title}
              address={[location.address, location.addressLine2].filter(Boolean).join(", ")}
              routeUrl={location.routeUrl || location.mapUrl}
              height={420}
            />
          ) : (
            <div className="location-map-fallback" style={{ minHeight: 420 }} role="status">
              <div className="location-map-fallback-inner">
                <div className="location-map-fallback-icon" aria-hidden>
                  ⌖
                </div>
                <strong>Карта этой локации пока не заполнена</strong>
                <p>
                  {[location.address, location.addressLine2].filter(Boolean).join(", ") ||
                    "Администратор ещё не указал координаты и ссылку маршрута."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
