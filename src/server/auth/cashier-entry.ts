/**
 * Cashier route gate. Session/role are decided from the DB user, never from
 * a pathname comparison like `/cashier/login`.
 */

const CASHIER_APP_ROLES = ["CASHIER", "DIRECTOR", "ADMIN", "OWNER"] as const;

export type CashierGateUser = {
  role: string;
  status: string;
} | null;

export type CashierGateSurface = "login" | "app";

export type CashierGateResult = "show-login" | "show-app" | "redirect-login" | "redirect-app";

export function isCashierAppUser(user: CashierGateUser): boolean {
  if (!user) return false;
  if (user.status !== "ACTIVE") return false;
  return (CASHIER_APP_ROLES as readonly string[]).includes(user.role);
}

export function cashierGate(user: CashierGateUser, surface: CashierGateSurface): CashierGateResult {
  const allowed = isCashierAppUser(user);
  if (surface === "login") return allowed ? "redirect-app" : "show-login";
  return allowed ? "show-app" : "redirect-login";
}

export function isStaffSessionAlive(
  session: { revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): boolean {
  if (session.revokedAt) return false;
  return session.expiresAt.getTime() >= now.getTime();
}
