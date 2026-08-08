/**
 * Map provider abstraction — no domain logic tied to a concrete map SDK.
 */
export type LocationMapPoint = {
  latitude: number;
  longitude: number;
  zoom?: number;
  title: string;
  address: string;
  routeUrl?: string | null;
};

export type LocationMapProps = LocationMapPoint & {
  className?: string;
  height?: number;
};

export function resolveRouteUrl(point: Pick<LocationMapPoint, "latitude" | "longitude" | "routeUrl" | "address">) {
  if (point.routeUrl?.trim()) return point.routeUrl.trim();
  const q = encodeURIComponent(point.address || `${point.latitude},${point.longitude}`);
  return `https://yandex.ru/maps/?rtext=~${point.latitude}%2C${point.longitude}&rtt=auto&text=${q}`;
}

export function hasCoordinates(point: { latitude?: number | null; longitude?: number | null }) {
  return (
    typeof point.latitude === "number" &&
    Number.isFinite(point.latitude) &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.longitude)
  );
}
