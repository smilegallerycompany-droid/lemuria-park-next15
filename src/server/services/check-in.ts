import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { formatDateInTimezone } from "@/lib/datetime";
import { getErrorReporter } from "@/server/monitoring/error-reporter";

export type CheckInResponse = {
  result: "SUCCESS" | "ALREADY_USED" | "INVALID" | "CANCELLED" | "EXPIRED";
  message: string;
  ticket?: {
    publicId: string;
    status: string;
    sessionLocalDate: string;
    sessionLocalTime: string;
    usedAt: string | null;
  };
};

/**
 * QR check-in. Every found-ticket attempt is logged. Never invents a valid scan.
 * Concurrent scans of the same ticket: only one SUCCESS (conditional update).
 */
export async function checkInTicket(params: {
  qrToken: string;
  cashierId: string;
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
    };

    if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED") {
      await log(ticket.id, "CANCELLED", params.cashierId, "Билет отменён/возвращён");
      return { result: "CANCELLED", message: "Билет отменён", ticket: baseTicket };
    }

    if (sessionDate !== today) {
      await log(ticket.id, "EXPIRED", params.cashierId, "Другая дата сеанса");
      return { result: "EXPIRED", message: "Билет на другую дату", ticket: baseTicket };
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
      // Conditional update — only one concurrent winner can flip VALID → USED.
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
