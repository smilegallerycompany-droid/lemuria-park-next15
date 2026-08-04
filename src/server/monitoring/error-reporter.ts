import { env } from "@/lib/config/env";

export type ErrorReportContext = {
  /** Stable event name, e.g. PAYMENT_CREATE_FAILED — never a secret. */
  event: string;
  /** Optional coarse tags (ids, codes). Never passwords, full QR, or full PII. */
  tags?: Record<string, string | number | boolean | null | undefined>;
  /** Safe free-form detail (already redacted by caller). */
  detail?: string;
};

/**
 * Pluggable error sink. Production may set ERROR_MONITORING_DSN later;
 * today we only require a console reporter — no Sentry SDK dependency.
 */
export interface ErrorReporter {
  captureException(error: unknown, context: ErrorReportContext): void;
  captureMessage(message: string, context: ErrorReportContext): void;
}

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|qr|email|phone|card|cvv|pan/i;

function redactTags(
  tags?: ErrorReportContext["tags"],
): Record<string, string | number | boolean | null> | undefined {
  if (!tags) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.length > 120) {
      out[key] = `${value.slice(0, 80)}…`;
      continue;
    }
    out[key] = value ?? null;
  }
  return out;
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 400);
  }
  return String(error).slice(0, 400);
}

export class ConsoleErrorReporter implements ErrorReporter {
  captureException(error: unknown, context: ErrorReportContext): void {
    console.error("[ErrorReporter]", context.event, {
      error: summarizeError(error),
      tags: redactTags(context.tags),
      detail: context.detail?.slice(0, 400),
      dsnConfigured: Boolean(env.ERROR_MONITORING_DSN),
    });
  }

  captureMessage(message: string, context: ErrorReportContext): void {
    console.error("[ErrorReporter]", context.event, {
      message: message.slice(0, 400),
      tags: redactTags(context.tags),
      detail: context.detail?.slice(0, 400),
      dsnConfigured: Boolean(env.ERROR_MONITORING_DSN),
    });
  }
}

let singleton: ErrorReporter | null = null;

/**
 * Returns the process-wide reporter. When ERROR_MONITORING_DSN is set we still
 * use ConsoleErrorReporter (DSN reserved for a future SDK wire-up) so deploys
 * never crash for missing Sentry packages.
 */
export function getErrorReporter(): ErrorReporter {
  if (!singleton) {
    singleton = new ConsoleErrorReporter();
  }
  return singleton;
}

/** Test helper — resets the singleton between unit tests if needed. */
export function __setErrorReporterForTests(reporter: ErrorReporter | null): void {
  singleton = reporter;
}
