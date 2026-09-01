/**
 * Guards that keep staging-only jobs off production databases.
 * DATABASE_URL values are never logged — only the database name is compared.
 */

export const STAGING_DATABASE_NAME = "lemuria_staging";

/** Parse the database name from a PostgreSQL URL without printing the URL. */
export function databaseNameFromUrl(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const normalized = raw.replace(/^postgres(ql)?:/i, "http:");
    const url = new URL(normalized);
    const name = decodeURIComponent(url.pathname.replace(/^\//, "").split("/")[0] ?? "");
    return name || null;
  } catch {
    return null;
  }
}

export function assertStagingDatabaseName(name: string | null | undefined): asserts name is string {
  if (name !== STAGING_DATABASE_NAME) {
    throw new Error(
      `Refusing: connected database is not ${STAGING_DATABASE_NAME}. Staging seed/migrate-on-start is blocked.`,
    );
  }
}

export function assertAllowStagingSeed(flag: string | undefined | null): void {
  if (flag !== "1") {
    throw new Error("Refusing: set ALLOW_STAGING_SEED=1 to run the staging seed.");
  }
}
