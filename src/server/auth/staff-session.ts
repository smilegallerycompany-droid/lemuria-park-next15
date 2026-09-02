import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import { DomainError } from "@/server/domain/errors";
import { isStaffSessionAlive } from "@/server/auth/cashier-entry";

export const STAFF_COOKIE_NAME = "lemuria_staff_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type StaffUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  locationIds: string[];
};

function hashToken(token: string): string {
  return createHash("sha256").update(`${env.AUTH_SECRET}:${token}`).digest("hex");
}

export async function createStaffSession(params: {
  userId: string;
  ip?: string | null;
  ua?: string | null;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.staffSession.create({
    data: {
      userId: params.userId,
      tokenHash,
      expiresAt,
      ip: params.ip ?? null,
      ua: params.ua ?? null,
    },
  });

  // Secure cookies only on HTTPS. `next start` sets NODE_ENV=production even for
  // local http://127.0.0.1 E2E — Secure+http would drop the session cookie.
  const secure = env.NEXT_PUBLIC_APP_URL.startsWith("https://");

  const jar = await cookies();
  jar.set(STAFF_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return token;
}

export async function clearStaffSessionCookie(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(STAFF_COOKIE_NAME)?.value;
  if (token) {
    await prisma.staffSession.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(STAFF_COOKIE_NAME);
}

export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.staffSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/** Revoke all sessions for a user except the current cookie session (if any). */
export async function revokeOtherUserSessions(userId: string): Promise<number> {
  const jar = await cookies();
  const token = jar.get(STAFF_COOKIE_NAME)?.value;
  const keepHash = token ? hashToken(token) : null;
  const result = await prisma.staffSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(keepHash ? { tokenHash: { not: keepHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

async function loadUser(userId: string): Promise<StaffUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      locations: { select: { locationId: true } },
    },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    locationIds: user.locations.map((l) => l.locationId),
  };
}

export async function getStaffSessionUser(): Promise<StaffUser | null> {
  const jar = await cookies();
  const token = jar.get(STAFF_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.staffSession.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!session || !isStaffSessionAlive(session)) {
    return null;
  }

  return loadUser(session.userId);
}

export async function requireStaffUser(allowedRoles: UserRole[]): Promise<StaffUser> {
  const user = await getStaffSessionUser();
  if (!user) {
    throw new DomainError("UNAUTHORIZED", "Требуется авторизация");
  }
  if (!allowedRoles.includes(user.role)) {
    throw new DomainError("FORBIDDEN", "Недостаточно прав");
  }
  return user;
}

export async function requireCashier(): Promise<StaffUser> {
  return requireStaffUser(["CASHIER", "DIRECTOR", "ADMIN", "OWNER"]);
}

/** Business director panel: DIRECTOR + ADMIN + OWNER. */
export async function requireDirector(): Promise<StaffUser> {
  return requireStaffUser(["DIRECTOR", "ADMIN", "OWNER"]);
}

/** Platform admin panel: ADMIN + OWNER. */
export async function requireAdmin(): Promise<StaffUser> {
  return requireStaffUser(["ADMIN", "OWNER"]);
}

export async function requireOwner(): Promise<StaffUser> {
  return requireStaffUser(["OWNER"]);
}

/** Backward-compatible aliases used by existing cashier routes. */
export const createCashierSessionCookie = async (userId: string) => createStaffSession({ userId });
export const clearCashierSessionCookie = clearStaffSessionCookie;
export const getCashierSessionUser = getStaffSessionUser;
export const COOKIE_NAME = STAFF_COOKIE_NAME;
