/**
 * Simple in-memory sliding-window rate limiter.
 * Suitable for a single Node process (Yandex Cloud one-instance / local).
 * Not shared across replicas — document that ALB/WAF should also rate-limit.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Max events inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Optional clock for tests. */
  now?: () => number;
};

/**
 * Records one attempt for `key` and returns whether it is still under the limit.
 */
export function consumeRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = options.now?.() ?? Date.now();
  const windowStart = now - options.windowMs;
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

  if (bucket.timestamps.length >= options.limit) {
    buckets.set(key, bucket);
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - bucket.timestamps.length),
    retryAfterSec: 0,
  };
}

/** Read-only check — does not record an attempt. */
export function isRateLimited(key: string, options: RateLimitOptions): RateLimitResult {
  const now = options.now?.() ?? Date.now();
  const windowStart = now - options.windowMs;
  const bucket = buckets.get(key);
  const timestamps = (bucket?.timestamps ?? []).filter((ts) => ts > windowStart);
  if (timestamps.length >= options.limit) {
    const oldest = timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - timestamps.length),
    retryAfterSec: 0,
  };
}

export function resetRateLimitStore(): void {
  buckets.clear();
}

/** Client IP from common proxy headers (Yandex ALB / Cloudflare / local). */
export function clientIpFromRequest(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
