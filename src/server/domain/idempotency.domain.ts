import { createHash } from "node:crypto";
import { DomainError } from "@/server/domain/errors";

/**
 * IdempotencyDomain — a repeated `Idempotency-Key` must always refer to the
 * *same* logical request. We store a hash of the normalized payload
 * alongside the key; a replay with a different payload is a client bug and
 * must be rejected loudly (`IDEMPOTENCY_CONFLICT`) instead of silently
 * returning an unrelated record.
 */
/** Deterministically stringifies a value, sorting object keys at every nesting level. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, canonicalize(entryValue)]));
  }
  return value;
}

export function hashIdempotencyPayload(payload: unknown): string {
  const canonical = JSON.stringify(canonicalize(payload));
  return createHash("sha256").update(canonical).digest("hex");
}

export function assertIdempotencyPayloadMatches(
  storedHash: string | null,
  incomingPayload: unknown,
): void {
  if (!storedHash) return;
  const incomingHash = hashIdempotencyPayload(incomingPayload);
  if (incomingHash !== storedHash) {
    throw new DomainError(
      "IDEMPOTENCY_CONFLICT",
      "Этот Idempotency-Key уже использован с другими данными запроса",
    );
  }
}
