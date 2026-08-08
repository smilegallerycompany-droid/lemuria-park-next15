import type { UserRole } from "@prisma/client";
import { DomainError } from "@/server/domain/errors";

const RANK: Record<UserRole, number> = {
  CASHIER: 1,
  DIRECTOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return targetRole === "ADMIN" || targetRole === "DIRECTOR" || targetRole === "CASHIER";
  if (actorRole === "DIRECTOR") return targetRole === "CASHIER";
  return false;
}

export function assertCanAssignRole(actorRole: UserRole, nextRole: UserRole) {
  if (actorRole === "DIRECTOR" && (nextRole === "ADMIN" || nextRole === "OWNER" || nextRole === "DIRECTOR")) {
    throw new DomainError("FORBIDDEN", "Директор не может назначать эту роль");
  }
  if (actorRole === "ADMIN" && nextRole === "OWNER") {
    throw new DomainError("FORBIDDEN", "Администратор не может назначить OWNER");
  }
  if (!canManageRole(actorRole, nextRole) && actorRole !== "OWNER") {
    throw new DomainError("FORBIDDEN", "Недостаточно прав для назначения роли");
  }
}

export function assertCanModifyUser(params: {
  actorRole: UserRole;
  actorId: string;
  targetRole: UserRole;
  targetId: string;
  nextRole?: UserRole;
}) {
  if (params.targetRole === "OWNER" && params.actorRole !== "OWNER") {
    throw new DomainError("FORBIDDEN", "Нельзя изменять OWNER");
  }
  if (params.nextRole) {
    assertCanAssignRole(params.actorRole, params.nextRole);
  }
  if (params.actorId === params.targetId && params.nextRole && RANK[params.nextRole] < RANK[params.actorRole]) {
    // demoting self is allowed only for non-last OWNER (checked separately)
  }
}

export function roleRank(role: UserRole): number {
  return RANK[role];
}
