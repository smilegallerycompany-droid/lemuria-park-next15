export function extractCronSecret(headers: Headers): string | null {
  const bearer = headers.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7).trim();
    return token || null;
  }
  const header = headers.get("x-cron-secret")?.trim();
  return header || null;
}

export const TIMER_CLEANUP_PAYLOAD = "lemuria-cron-cleanup";

/**
 * Yandex Timer → Serverless Container sends POST JSON (not a public HTTP call).
 * IAM is enforced by a private container; this only recognizes the event shape
 * and a non-secret discriminator so random POSTs are ignored.
 */
export function isYandexTimerCleanupEvent(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.some((message) => {
    if (!message || typeof message !== "object") return false;
    const eventType = (message as { event_metadata?: { event_type?: string } }).event_metadata
      ?.event_type;
    const payload =
      (message as { details?: { payload?: string } }).details?.payload ??
      (message as { payload?: string }).payload;
    const isTimer =
      typeof eventType === "string" && eventType.toLowerCase().includes("timer");
    return isTimer && payload === TIMER_CLEANUP_PAYLOAD;
  });
}

/** Gateway-proxied calls must use CRON_SECRET; IAM timer calls have no gateway id. */
export function isGatewayProxied(headers: Headers): boolean {
  return Boolean(headers.get("x-serverless-gateway-id")?.trim());
}

/**
 * Yandex Timer → Container POSTs to `/` (console has no path field).
 * Only rewrite private IAM invokes, never API Gateway traffic.
 */
export function isPrivateTimerRootPost(method: string, pathname: string, headers: Headers): boolean {
  return method === "POST" && pathname === "/" && !isGatewayProxied(headers);
}
