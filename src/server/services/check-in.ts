import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { formatDateInTimezone } from "@/lib/datetime";
import { getErrorReporter } from "@/server/monitoring/error-reporter";

export type CheckInResultCode =
  | "SUCCESS"
  | "ALREADY_USED"
  | "INVALID"
  | "CANCELLED"
  | "EXPIRED"
  | "WRONG_DATE"
  | "WRONG_LOCATION";

export type CheckInResponse = {
  result: CheckInResultCode;
  message: string;
  ticket?: {
    publicId: string;
    status: string;
    sessionLocalDate: string;
    sessionLocalTime: string;
    usedAt: string | null;
    locationName?: string;
  };
};

/**
 * QR check-in. Every found-ticket attempt is logged. Never invents a valid scan.
 * Concurrent scans of the same ticket: only one SUCCESS (conditional update).
 */
export async function checkInTicket(params: {
  qrToken: string;
  cashierId: string;
  /** Empty / omitted = all locations (OWNER/ADMIN). */
  allowedLocationIds?: string[];
}): Promise<CheckInResponse> {
  const token = params.qrToken.trim();
  if (!token) {
    return { result: "INVALID", message: "Пустой QR-код" };
  }

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { qrToken: token },
      include: {
        session: { include: { location: true } },
      },
    });

    if (!ticket) {
      return { result: "INVALID", message: "Билет не найден" };
    }

    const tz = ticket.session.location.timezone;
    const sessionDate = formatDateInTimezone(ticket.session.startsAt, tz);
    const today = formatDateInTimezone(new Date(), tz);
    const sessionLocalTime = new Intl.DateTimeFormat("ru-RU", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(ticket.session.startsAt);

    const baseTicket = {
      publicId: ticket.publicId,
      status: ticket.status,
      sessionLocalDate: sessionDate,
      sessionLocalTime,
      usedAt: ticket.usedAt?.toISOString() ?? null,
      locationName: ticket.session.location.name,
    };

    const allowed = params.allowedLocationIds ?? [];
    if (allowed.length > 0 && !allowed.includes(ticket.session.locationId)) {
      await log(ticket.id, "INVALID", params.cashierId, "Wrong location");
      return {
        result: "WRONG_LOCATION",
        message: `Билет для другой локации: ${ticket.session.location.name}`,
        ticket: baseTicket,
      };
    }

    if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED") {
      await log(ticket.id, "CANCELLED", params.cashierId, "Билет отменён/возвращён");
      return { result: "CANCELLED", message: "Билет отменён", ticket: baseTicket };
    }

    if (sessionDate !== today) {
      await log(ticket.id, "EXPIRED", params.cashierId, "Другая дата сеанса");
      return {
        result: "WRONG_DATE",
        message: `Билет на ${sessionDate}, сегодня ${today}`,
        ticket: baseTicket,
      };
    }

    if (ticket.status === "USED" || ticket.usedAt) {
      await log(ticket.id, "ALREADY_USED", params.cashierId, "Повторное сканирование");
      return {
        result: "ALREADY_USED",
        message: "Билет уже использован",
        ticket: baseTicket,
      };
    }

    const usedAt = new Date();
    const outcome = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.updateMany({
        where: { id: ticket.id, status: "VALID", usedAt: null },
        data: { status: "USED", usedAt },
      });

      if (updated.count === 0) {
        await tx.ticketCheckIn.create({
          data: {
            ticketId: ticket.id,
            result: "ALREADY_USED",
            scannedById: params.cashierId,
            note: "Повторное сканирование (гонка)",
          },
        });
        return "ALREADY_USED" as const;
      }

      await tx.ticketCheckIn.create({
        data: {
          ticketId: ticket.id,
          result: "SUCCESS",
          scannedById: params.cashierId,
        },
      });
      await recordAuditLog(tx, {
        actorId: params.cashierId,
        action: "TICKET_CHECK_IN",
        entityType: "Ticket",
        entityId: ticket.id,
      });
      return "SUCCESS" as const;
    });

    if (outcome === "ALREADY_USED") {
      const refreshed = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      return {
        result: "ALREADY_USED",
        message: "Билет уже использован",
        ticket: {
          ...baseTicket,
          status: refreshed?.status ?? "USED",
          usedAt: refreshed?.usedAt?.toISOString() ?? usedAt.toISOString(),
        },
      };
    }

    return {
      result: "SUCCESS",
      message: "Проход разрешён",
      ticket: { ...baseTicket, status: "USED", usedAt: usedAt.toISOString() },
    };
  } catch (error) {
    getErrorReporter().captureException(error, {
      event: "CHECK_IN_INTERNAL_ERROR",
      tags: { cashierId: params.cashierId },
    });
    throw error;
  }
}

async function log(
  ticketId: string,
  result: "SUCCESS" | "ALREADY_USED" | "INVALID" | "CANCELLED" | "EXPIRED",
  cashierId: string,
  note: string,
) {
  await prisma.ticketCheckIn.create({
    data: { ticketId, result, scannedById: cashierId, note },
  });
}
