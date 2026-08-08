"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  hasCoordinates,
  resolveRouteUrl,
  type LocationMapProps,
} from "@/lib/maps/types";

/**
 * Yandex Maps JS API v3-lite embed via script tag.
 * Falls back to a premium static card if API key missing or load fails.
 * Never breaks the public page.
 */
export function LocationMap(props: LocationMapProps) {
  const mapId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? "";
  const ready = hasCoordinates(props);
  const route = resolveRouteUrl(props);
  const height = props.height ?? 420;

  useEffect(() => {
    if (!ready || !apiKey || failed) return;
    let cancelled = false;
    let map: {
      addChild?: (child: unknown) => void;
      destroy?: () => void;
    } | null = null;

    async function boot() {
      try {
        await loadYmaps3(apiKey);
        if (cancelled || !containerRef.current || !(window as unknown as { ymaps3?: Ymaps3 }).ymaps3) {
          setFailed(true);
          return;
        }
        const ymaps3 = (window as unknown as { ymaps3: Ymaps3 }).ymaps3;
        await ymaps3.ready;
        const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker } = ymaps3;
        const center: [number, number] = [props.longitude!, props.latitude!];
        const instance = new YMap(containerRef.current, {
          location: { center, zoom: props.zoom ?? 16 },
        });
        map = instance;
        instance.addChild?.(new YMapDefaultSchemeLayer({}));
        instance.addChild?.(new YMapDefaultFeaturesLayer({}));
        const markerEl = document.createElement("div");
        markerEl.className = "lemuria-map-marker";
        markerEl.innerHTML = `<button type="button" class="lemuria-map-pin" aria-label="${escapeHtml(props.title)}"></button>`;
        markerEl.querySelector("button")?.addEventListener("click", () => {
          const balloon = markerEl.querySelector(".lemuria-map-balloon");
          if (balloon) balloon.classList.toggle("open");
          else {
            const b = document.createElement("div");
            b.className = "lemuria-map-balloon open";
            b.innerHTML = `<strong>${escapeHtml(props.title)}</strong><p>${escapeHtml(props.address)}</p><a href="${escapeHtml(route)}" target="_blank" rel="noreferrer">Маршрут</a>`;
            markerEl.appendChild(b);
          }
        });
        instance.addChild?.(new YMapMarker({ coordinates: center }, markerEl));
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      try {
        map?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [apiKey, failed, props.address, props.latitude, props.longitude, props.title, props.zoom, ready, route]);

  if (!ready || !apiKey || failed) {
    return (
      <div className={`location-map-fallback ${props.className ?? ""}`} style={{ minHeight: height }}>
        <div className="location-map-fallback-inner">
          <div className="location-map-fallback-icon" aria-hidden>
            ⌖
          </div>
          <strong>{props.title}</strong>
          <p>{props.address}</p>
          <a className="button button-orange" href={route} target="_blank" rel="noreferrer">
            Открыть расположение на карте
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`map-${mapId}`}
      ref={containerRef}
      className={`location-map-canvas ${props.className ?? ""}`}
      style={{ height }}
      role="img"
      aria-label={`Карта: ${props.title}`}
    />
  );
}

type Ymaps3 = {
  ready: Promise<void>;
  YMap: new (
    el: HTMLElement,
    opts: { location: { center: [number, number]; zoom: number } },
  ) => {
    addChild?: (child: unknown) => void;
    destroy?: () => void;
  };
  YMapDefaultSchemeLayer: new (opts: object) => unknown;
  YMapDefaultFeaturesLayer: new (opts: object) => unknown;
  YMapMarker: new (opts: { coordinates: [number, number] }, el: HTMLElement) => unknown;
};

function loadYmaps3(apiKey: string): Promise<void> {
  const w = window as unknown as { ymaps3?: Ymaps3; __ymaps3Loading?: Promise<void> };
  if (w.ymaps3) return Promise.resolve();
  if (w.__ymaps3Loading) return w.__ymaps3Loading;
  w.__ymaps3Loading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-ymaps3]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("ymaps load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    s.async = true;
    s.dataset.ymaps3 = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("ymaps load failed"));
    document.head.appendChild(s);
  });
  return w.__ymaps3Loading;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
