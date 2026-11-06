import type { Prisma } from "@prisma/client";
import type { StaffUser } from "./staff-session";
import { DomainError } from "@/server/domain/errors";
import { assertLocationAccess } from "./location-access";
import { assertCanModifyUser } from "./role-policy";

export function managedStaffFilter(actor: StaffUser): Prisma.UserWhereInput {
  if (actor.role === "DIRECTOR")
    return {
      role: "CASHIER",
      locations: {
        some: { locationId: { in: actor.locationIds } },
        every: { locationId: { in: actor.locationIds } },
      },
    };
  return { role: { in: ["CASHIER", "DIRECTOR", "ADMIN"] } };
}

export function assertManagedStaffAccess(
  actor: StaffUser,
  target: {
    id: string;
    role: StaffUser["role"];
    locations: Array<{ locationId: string }>;
  },
  nextRole?: StaffUser["role"],
) {
  assertCanModifyUser({
    actorRole: actor.role,
    actorId: actor.id,
    targetRole: target.role,
    targetId: target.id,
    nextRole,
  });
  if (actor.role === "DIRECTOR" && target.locations.length === 0) {
    throw new DomainError("FORBIDDEN", "Сотрудник не относится к вашим локациям");
  }
  for (const binding of target.locations) assertLocationAccess(actor, binding.locationId);
}
