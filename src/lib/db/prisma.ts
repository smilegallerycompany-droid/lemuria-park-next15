import { PrismaClient, Prisma } from "@prisma/client";
import { env } from "@/lib/config/env";

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

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
