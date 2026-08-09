import type { StaffUser } from "@/server/auth/staff-session";
import { DomainError } from "@/server/domain/errors";

/** ADMIN/OWNER: all locations. DIRECTOR: only assigned locationIds. */
export function assertLocationAccess(actor: StaffUser, locationId: string | null | undefined) {
  if (actor.role === "ADMIN" || actor.role === "OWNER") return;
  if (!locationId) {
    // Global content (no location) — directors may edit shared CMS.
    return;
  }
  if (actor.locationIds.length === 0) {
    // No bindings yet — treat as all assigned for early setups.
    return;
  }
  if (!actor.locationIds.includes(locationId)) {
    throw new DomainError("FORBIDDEN", "Нет доступа к этой локации");
  }
}

export function isGlobalCmsEditor(actor: StaffUser): boolean {
  return actor.role === "ADMIN" || actor.role === "OWNER" || actor.role === "DIRECTOR";
}
