import type { StaffUser } from "@/server/auth/staff-session";
import { DomainError } from "@/server/domain/errors";

/**
 * ADMIN/OWNER: all locations (`null`).
 * CASHIER/DIRECTOR: assigned ids only. Empty bindings mean no rows — never "all".
 */
export function locationIdsForActor(actor: StaffUser): string[] | null {
  if (actor.role === "ADMIN" || actor.role === "OWNER") return null;
  return actor.locationIds;
}

export function canAccessLocation(actor: StaffUser, locationId: string | null | undefined): boolean {
  if (actor.role === "ADMIN" || actor.role === "OWNER") return true;
  if (!locationId) {
    // Global content (no location) — directors may edit shared CMS.
    return actor.role === "DIRECTOR";
  }
  const ids = locationIdsForActor(actor);
  if (ids === null) return true;
  return ids.includes(locationId);
}

/** ADMIN/OWNER: all locations. DIRECTOR/CASHIER: only assigned locationIds. */
export function assertLocationAccess(actor: StaffUser, locationId: string | null | undefined) {
  if (canAccessLocation(actor, locationId)) return;
  throw new DomainError("FORBIDDEN", "Нет доступа к этой локации");
}

/**
 * Resolve list-query location constraint.
 * `null` = unrestricted. `[]` = match nothing. otherwise `IN (...)`.
 */
export function constrainLocationIds(
  actor: StaffUser,
  requestedLocationId?: string | null,
): string[] | null {
  if (requestedLocationId) {
    assertLocationAccess(actor, requestedLocationId);
    return [requestedLocationId];
  }
  return locationIdsForActor(actor);
}

export function isGlobalCmsEditor(actor: StaffUser): boolean {
  return actor.role === "ADMIN" || actor.role === "OWNER" || actor.role === "DIRECTOR";
}

export function checkInLocationScope(actor: StaffUser): string[] | undefined {
  const ids = locationIdsForActor(actor);
  return ids === null ? undefined : ids;
}
