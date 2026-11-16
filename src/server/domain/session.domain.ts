import type { Session } from "@prisma/client";
import { DomainError } from "@/server/domain/errors";

/**
 * SessionDomain — pure business rules about whether a session can currently
 * accept new bookings. No I/O, no Prisma calls: takes plain data, returns
 * decisions or throws a `DomainError`.
 */

function hasBookableStatus(status: Session["status"]): boolean {
  return status === "SCHEDULED" || status === "OPEN";
}

export function isSessionBookable(
  session: Pick<Session, "status" | "startsAt">,
  now: Date,
): boolean {
  return hasBookableStatus(session.status) && session.startsAt.getTime() > now.getTime();
}

/**
 * Generic over `T` so the caller's richer session shape (e.g. with a
 * `location` relation included) is preserved after the assertion narrows
 * away `null`, instead of collapsing to the minimal `Pick<...>` shape.
 */
export function assertSessionBookable<T extends Pick<Session, "status" | "startsAt">>(
  session: T | null,
  now: Date,
): asserts session is T {
  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Сеанс не найден");
  }
  if (!isSessionBookable(session, now)) {
    throw new DomainError("SESSION_NOT_AVAILABLE", "Сеанс недоступен для бронирования");
  }
}

export function isSessionSellableAtCashier(
  session: Pick<Session, "status" | "endsAt">,
  now: Date,
): boolean {
  return hasBookableStatus(session.status) && session.endsAt.getTime() > now.getTime();
}

export function assertSessionSellableAtCashier<T extends Pick<Session, "status" | "endsAt">>(
  session: T | null,
  now: Date,
): asserts session is T {
  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Сеанс не найден");
  }
  if (!isSessionSellableAtCashier(session, now)) {
    throw new DomainError("SESSION_NOT_AVAILABLE", "Продажи на сеанс закрыты");
  }
}
