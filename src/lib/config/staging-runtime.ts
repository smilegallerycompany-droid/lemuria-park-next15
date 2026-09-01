import { DomainError } from "@/server/domain/errors";
import {
  STAGING_DATABASE_NAME,
  databaseNameFromUrl,
} from "@/lib/config/staging-db-guard";

export function isStagingAppEnv(appEnv: string | undefined | null): boolean {
  return appEnv === "staging";
}

/**
 * Staging-only test payment. Production (`lemuria`) and any other database
 * are refused with the same public message — never leak the DB name.
 */
export function assertStagingTestPaymentAllowed(params: {
  appEnv: string | undefined | null;
  databaseUrl: string | undefined | null;
}): void {
  const dbName = databaseNameFromUrl(params.databaseUrl ?? undefined);
  if (!isStagingAppEnv(params.appEnv) || dbName !== STAGING_DATABASE_NAME) {
    throw new DomainError("STAGING_PAY_DISABLED", "Тестовая оплата недоступна");
  }
}
