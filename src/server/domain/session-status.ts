import type { SessionStatus } from "@prisma/client";
import { DomainError } from "@/server/domain/errors";

const ALLOWED: Record<SessionStatus, readonly SessionStatus[]> = {
  SCHEDULED: ["OPEN", "CLOSED", "CANCELLED"],
  OPEN: ["CLOSED", "CANCELLED", "COMPLETED"],
  CLOSED: ["OPEN", "CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
};

export function canTransitionSessionStatus(from: SessionStatus, to: SessionStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}

export function assertSessionStatusTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransitionSessionStatus(from, to)) {
    throw new DomainError(
      "INVALID_STATUS_TRANSITION",
      `Нельзя перевести сеанс из ${from} в ${to}`,
      { from, to },
    );
  }
}
