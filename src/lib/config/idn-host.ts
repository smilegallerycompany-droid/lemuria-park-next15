/**
 * IDN hostname normalization. Edge-safe (WHATWG URL only).
 * Do not hand-roll Punycode — browsers and API Gateway send ACE (xn--).
 */
export function toAsciiHostname(hostname: string): string {
  const host = hostname.trim().toLowerCase();
  if (!host) return host;
  try {
    if (host.startsWith("[")) {
      return new URL(`http://${host}`).hostname.toLowerCase();
    }
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return host;
  }
}
