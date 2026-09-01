/**
 * Yandex Managed PostgreSQL port 6432 is a pooler. Prisma must disable
 * prepared-statement caching (`pgbouncer=true`) or idle pooled connections
 * reset with P1017. Keep one connection per Serverless instance by default.
 */
export function withPrismaPoolParams(
  raw: string,
  options: { connectionLimit?: string; nodeEnv?: string } = {},
): string {
  const params = new URLSearchParams();
  const queryIndex = raw.indexOf("?");
  const base = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
  if (queryIndex >= 0) {
    new URLSearchParams(raw.slice(queryIndex + 1)).forEach((value, key) => {
      params.set(key, value);
    });
  }

  const nodeEnv = options.nodeEnv ?? "development";
  const fromEnv = (options.connectionLimit ?? "").trim();
  if (!params.has("connection_limit")) {
    const limit = fromEnv || (nodeEnv === "production" ? "1" : "");
    if (limit) params.set("connection_limit", limit);
  }

  const usesYandexPooler = /:6432(?:\/|\?|$)/.test(base);
  if (usesYandexPooler && !params.has("pgbouncer")) {
    params.set("pgbouncer", "true");
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
