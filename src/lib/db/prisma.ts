import { PrismaClient, Prisma } from "@prisma/client";
import { env } from "@/lib/config/env";
import { withPrismaPoolParams } from "@/lib/db/prisma-pool";

/** A regular PrismaClient or an interactive `$transaction` callback client. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Safe PrismaClient singleton.
 *
 * Next.js hot-reloads server modules in development, which would otherwise
 * create a new PrismaClient (and a new DB connection pool) on every reload.
 * We stash the instance on `globalThis` so it survives reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function datasourceUrl(): string {
  return withPrismaPoolParams(env.DATABASE_URL, {
    connectionLimit: env.PRISMA_CONNECTION_LIMIT,
    nodeEnv: env.NODE_ENV,
  });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: { db: { url: datasourceUrl() } },
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
