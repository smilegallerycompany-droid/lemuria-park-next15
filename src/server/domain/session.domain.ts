import type { Session } from "@prisma/client";
import { DomainError } from "@/server/domain/errors";

/**
 * SessionDomain — pure business rules about whether a session can currently
 * accept new bookings. No I/O, no Prisma calls: takes plain data, returns
 * decisions or throws a `DomainError`.
 */

export function isSessionBookable(
  session: Pick<Session, "status" | "startsAt">,
  now: Date,
): boolean {
  if (session.status !== "SCHEDULED" && session.status !== "OPEN") {
    return false;
  }
  return session.startsAt.getTime() > now.getTime();
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
