import { z } from "zod";

/**
 * Environment for Lemuria Park on Yandex Cloud / local.
 * Payment and email never invent success when credentials are missing.
 *
 * Seed passwords such as ChangeMe123! are demo-only — never use them in
 * production. `prisma/seed.ts` refuses to run when NODE_ENV=production.
 */
const DEFAULT_AUTH_SECRET = "dev-only-auth-secret-change-me";
const DEFAULT_QR_SECRET = "dev-qr-signing-secret-change-me";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL is required"),

  NEXT_PUBLIC_APP_URL: z
    .string({ required_error: "NEXT_PUBLIC_APP_URL is required" })
    .url({ message: "NEXT_PUBLIC_APP_URL must be a valid URL" }),

  /** ЮKassa (Russian acquiring — works without VPN). */
  YUKASSA_SHOP_ID: z.string().optional().default(""),
  YUKASSA_SECRET_KEY: z.string().optional().default(""),

  /** Yandex Cloud Postbox / SMTP bridge. */
  EMAIL_PROVIDER: z.enum(["none", "yandex_postbox"]).default("none"),
  EMAIL_FROM: z.string().optional().default(""),
  EMAIL_SMTP_HOST: z.string().optional().default(""),
  EMAIL_SMTP_USER: z.string().optional().default(""),
  EMAIL_SMTP_PASSWORD: z.string().optional().default(""),
  EMAIL_API_ENDPOINT: z.string().optional().default(""),
  EMAIL_API_KEY: z.string().optional().default(""),

  QR_SIGNING_SECRET: z.string().min(8).default(DEFAULT_QR_SECRET),
  AUTH_SECRET: z.string().min(16).default(DEFAULT_AUTH_SECRET),

  /** Timer-trigger auth for `/api/cron/cleanup`. Empty locally → route returns 503. */
  CRON_SECRET: z.string().optional().default(""),

  /**
   * Comma-separated Host allowlist (no scheme). Empty locally → skip check.
   * Production must list the four product hosts plus any temporary gateway host.
   */
  ALLOWED_HOSTS: z.string().optional().default(""),

  /** `staging` enables site-wide noindex. */
  APP_ENV: z.string().optional().default(""),

  /** Prisma pool cap per container instance. Default 5 in production runtime. */
  PRISMA_CONNECTION_LIMIT: z.string().optional().default(""),

  /**
   * Optional DSN for a future error monitoring SDK (Sentry, etc.).
   * Presently only signals ConsoleErrorReporter that a sink is configured.
   */
  ERROR_MONITORING_DSN: z.string().optional().default(""),
});

export type Env = z.infer<typeof envSchema>;

function isWeakSecret(value: string, defaults: string[]): boolean {
  const lower = value.toLowerCase();
  if (defaults.some((d) => value === d || lower.includes("change-me") || lower.includes("dev-only"))) {
    return true;
  }
  if (lower.includes("dev-qr") || lower.includes("replace-with")) {
    return true;
  }
  return false;
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  const data = parsed.data;
  const isProductionRuntime =
    data.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.npm_lifecycle_event !== "build";
  const isLocalhostApp =
    data.NEXT_PUBLIC_APP_URL.includes("localhost") ||
    data.NEXT_PUBLIC_APP_URL.includes("127.0.0.1");

  if (isProductionRuntime && !isLocalhostApp) {
    if (
      isWeakSecret(data.AUTH_SECRET, [DEFAULT_AUTH_SECRET]) ||
      data.AUTH_SECRET.length < 32
    ) {
      throw new Error(
        "Production requires a strong AUTH_SECRET (min 32 chars, not a default/dev value).",
      );
    }
    if (
      isWeakSecret(data.QR_SIGNING_SECRET, [DEFAULT_QR_SECRET]) ||
      data.QR_SIGNING_SECRET.length < 32
    ) {
      throw new Error(
        "Production requires a strong QR_SIGNING_SECRET (min 32 chars, not a default/dev value).",
      );
    }
    if (isWeakSecret(data.CRON_SECRET, []) || data.CRON_SECRET.length < 32) {
      throw new Error(
        "Production requires a strong CRON_SECRET (min 32 chars, not a default/dev value).",
      );
    }
    if (!data.ALLOWED_HOSTS.trim()) {
      throw new Error(
        "Production requires ALLOWED_HOSTS (comma-separated hostnames for the four products).",
      );
    }
  }

  return data;
}

export const env = loadEnv();
