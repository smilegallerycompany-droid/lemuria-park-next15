import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { recordSaleOnShift } from "@/server/services/cashier-shifts";
import { issueTicketsForOrder } from "@/server/services/tickets";
import { createTerminalHandler } from "@/server/services/evotor-checkout-core";
export { terminalForLocation, authenticateTerminal } from "@/server/services/evotor-terminal";

export const handleTerminalRequest = createTerminalHandler({
  prisma, recordAuditLog, recordSaleOnShift, issueTicketsForOrder,
});
