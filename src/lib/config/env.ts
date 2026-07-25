import { z } from "zod";

/**
 * All required/optional environment variables for the app are declared and
 * validated here. Importing this module fails fast with a readable error if
 * the runtime environment is misconfigured, instead of failing later with a
 * confusing runtime error deep inside a request handler.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** PostgreSQL connection string used by Prisma. */
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .url({ message: "DATABASE_URL must be a valid connection string" }),

  /** Public base URL of the app, used to build absolute links (tickets, QR, etc). */
  NEXT_PUBLIC_APP_URL: z
    .string({ required_error: "NEXT_PUBLIC_APP_URL is required" })
    .url({ message: "NEXT_PUBLIC_APP_URL must be a valid URL" }),

  // The following are reserved for future sprints (payments/email/QR) and are
  // intentionally optional here — this stage does not wire them up yet.
  YUKASSA_SHOP_ID: z.string().optional(),
  YUKASSA_SECRET_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  QR_SIGNING_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
