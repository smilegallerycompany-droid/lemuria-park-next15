import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { formatDateInTimezone } from "@/lib/datetime";

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
 */
export async function checkInTicket(params: {
  qrToken: string;
  cashierId: string;
}): Promise<CheckInResponse> {
  const token = params.qrToken.trim();
  if (!token) {
    return { result: "INVALID", message: "Пустой QR-код" };
  }

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

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: "USED", usedAt: new Date() },
    });
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
  });

  return {
    result: "SUCCESS",
    message: "Проход разрешён",
    ticket: { ...baseTicket, status: "USED", usedAt: new Date().toISOString() },
  };
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
