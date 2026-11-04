/**
 * Only accept Yandex's generated HTTPS map-widget URLs.
 * Ordinary links to maps search pages cannot be embedded as iframe widgets.
 */
export function trustedYandexMapWidgetUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.hostname === "yandex.ru" && url.pathname.startsWith("/map-widget/v1/")) {
      return url.href;
    }
    if (url.hostname === "api-maps.yandex.ru" && url.pathname.startsWith("/frame/v1/")) {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}
