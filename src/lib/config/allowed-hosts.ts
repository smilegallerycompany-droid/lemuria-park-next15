/**
 * Host allowlist for the public + staff products behind one Next.js container.
 * Do not trust X-Forwarded-Host for authorization. The API Gateway must pass
 * the original Host; we compare that incoming Host against ALLOWED_HOSTS.
 *
 * IDN: compare ASCII/Punycode only. Unicode and xn-- forms of the same name match.
 */

import { toAsciiHostname } from "@/lib/config/idn-host";

export function parseAllowedHosts(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => {
      const trimmed = part.trim().toLowerCase();
      if (!trimmed) return "";
      if (trimmed.startsWith("*.")) {
        const suffix = toAsciiHostname(trimmed.slice(2));
        return suffix ? `*.${suffix}` : "";
      }
      return toAsciiHostname(trimmed);
    })
    .filter(Boolean);
}

/** Strip an optional port from a Host header. IPv6 in brackets is supported. */
export function hostnameFromHostHeader(host: string | null | undefined): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    const inner = end >= 0 ? trimmed.slice(1, end) : trimmed;
    return inner || null;
  }
  const colon = trimmed.lastIndexOf(":");
  const withoutPort =
    colon > -1 && /^\d+$/.test(trimmed.slice(colon + 1)) ? trimmed.slice(0, colon) : trimmed;
  return toAsciiHostname(withoutPort) || null;
}

export function isHostAllowed(hostname: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const host = toAsciiHostname(hostname);
  return allowed.some((entry) => {
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1);
      return host === entry.slice(2) || host.endsWith(suffix);
    }
    return host === entry;
  });
}

const HEALTH_PATHS = new Set(["/api/health/live", "/api/health/ready"]);

export function shouldSkipHostAllowlist(pathname: string): boolean {
  return HEALTH_PATHS.has(pathname);
}
