/**
 * Cashier session helpers — backed by DB StaffSession + AUTH_SECRET.
 * Kept as a thin re-export so existing `/api/cashier/*` imports keep working.
 */
export {
  createCashierSessionCookie,
  clearCashierSessionCookie,
  getCashierSessionUser,
  COOKIE_NAME,
  createStaffSession,
  clearStaffSessionCookie,
  getStaffSessionUser,
  requireCashier,
  requireDirector,
  STAFF_COOKIE_NAME,
} from "@/server/auth/staff-session";
