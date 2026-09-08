import { domainToUnicode } from "node:url";
import { toAsciiHostname } from "@/lib/config/idn-host";

/** User-facing origin; IDN host is Unicode (парклемурия.рф), not xn--. */
export function displayOriginFromUrl(raw: string): string {
  const url = new URL(raw);
  const unicode = domainToUnicode(url.hostname) || url.hostname;
  const port = url.port && url.port !== "443" && url.port !== "80" ? `:${url.port}` : "";
  return `${url.protocol}//${unicode}${port}`;
}

/** ASCII/Punycode origin for allowlists, cookies-adjacent URLs, and provider cabinets. */
export function asciiOriginFromUrl(raw: string): string {
  const url = new URL(raw);
  const host = toAsciiHostname(url.hostname);
  const port = url.port && url.port !== "443" && url.port !== "80" ? `:${url.port}` : "";
  return `${url.protocol}//${host}${port}`;
}
