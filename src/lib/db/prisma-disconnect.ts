/**
 * Yandex Managed PostgreSQL port 6432 is Odyssey (PgBouncer-compatible).
 * Frozen Serverless instances keep a Prisma socket that the pooler already
 * closed → Prisma P1017 "Server has closed the connection."
 */

export function isPrismaServerClosed(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "P1017") return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Server has closed the connection");
}
