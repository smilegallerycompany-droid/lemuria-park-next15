/**
 * Host allowlist for the public + staff products behind one Next.js container.
 * Do not trust X-Forwarded-Host for authorization. The API Gateway must pass
 * the original Host; we compare that incoming Host against ALLOWED_HOSTS.
 */

export function parseAllowedHosts(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/** Strip an optional port from a Host header. IPv6 in brackets is supported. */
export function hostnameFromHostHeader(host: string | null | undefined): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end >= 0 ? trimmed.slice(1, end) : trimmed;
  }
  const colon = trimmed.lastIndexOf(":");
  if (colon > -1 && /^\d+$/.test(trimmed.slice(colon + 1))) {
    return trimmed.slice(0, colon);
  }
  return trimmed;
}

export function isHostAllowed(hostname: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const host = hostname.toLowerCase();
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
