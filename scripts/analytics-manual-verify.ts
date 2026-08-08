/**
 * Manual analytics verification against live DB.
 * Run: npx tsx scripts/analytics-manual-verify.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { prisma } from "../src/lib/db/prisma";
import { getDirectorAnalyticsReport } from "../src/server/services/analytics-report";
import { resolveAnalyticsPeriod } from "../src/server/services/analytics-period";
import {
  averageOrderValueKopecks,
  averageTicketPriceKopecks,
  ratePercent,
  reservationConversionRate,
} from "../src/server/services/analytics-formulas";

type Row = {
  metric: string;
  formula: string;
  expected: string | number;
  actual: string | number;
  status: "PASS" | "FAIL";
};

function money(k: number) {
  return (k / 100).toFixed(2);
}

async function main() {
  const timeZone = "Europe/Moscow";
  const { from, to } = resolveAnalyticsPeriod({
    preset: "last_30",
    timeZone,
  });

  const report = await getDirectorAnalyticsReport({ from, to, timeZone });

  const paidWhere = {
    status: "PAID" as const,
    createdAt: { gte: from, lte: to },
  };

  const [
    grossAgg,
    refundAgg,
    paidOrders,
    ticketsSold,
    onlineAgg,
    cashierAgg,
    cashPay,
    cardPay,
    sitePay,
    checkIns,
    noShow,
    capacitySessions,
    seatsAgg,
    reservationsCreated,
    paidFromReservations,
    locations,
    cashiers,
  ] = await Promise.all([
    prisma.order.aggregate({ where: paidWhere, _sum: { totalAmount: true } }),
    prisma.refund.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: from, lte: to }, order: paidWhere },
      _sum: { amount: true },
    }),
    prisma.order.count({ where: paidWhere }),
    prisma.ticket.count({
      where: { order: paidWhere, status: { in: ["VALID", "USED"] } },
    }),
    prisma.order.aggregate({
      where: { ...paidWhere, source: "ONLINE" },
      _sum: { totalAmount: true },
    }),
    prisma.order.aggregate({
      where: { ...paidWhere, source: "CASHIER" },
      _sum: { totalAmount: true },
    }),
    prisma.payment.aggregate({
      where: { status: "SUCCEEDED", method: "CASH", order: paidWhere },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: "SUCCEEDED", method: "CARD_TERMINAL", order: paidWhere },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: "SUCCEEDED", method: "CARD_ONLINE", order: paidWhere },
      _sum: { amount: true },
    }),
    prisma.ticketCheckIn.count({
      where: { result: "SUCCESS", scannedAt: { gte: from, lte: to }, ticket: { order: paidWhere } },
    }),
    prisma.ticket.count({
      where: {
        status: "VALID",
        order: paidWhere,
        session: { endsAt: { lt: new Date() } },
        checkIns: { none: { result: "SUCCESS" } },
      },
    }),
    prisma.session.findMany({
      where: { startsAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: { capacity: true },
    }),
    prisma.orderItem.aggregate({ where: { order: paidWhere }, _sum: { quantity: true } }),
    prisma.reservation.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.order.count({ where: { ...paidWhere, reservationId: { not: null } } }),
    prisma.location.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "CASHIER", status: "ACTIVE" } }),
  ]);

  const gross = grossAgg._sum.totalAmount ?? 0;
  const refunded = refundAgg._sum.amount ?? 0;
  const net = Math.max(0, gross - refunded);
  const capacity = capacitySessions.reduce((s, x) => s + x.capacity, 0);
  const seats = seatsAgg._sum.quantity ?? 0;
  const online = onlineAgg._sum.totalAmount ?? 0;
  const cashier = cashierAgg._sum.totalAmount ?? 0;

  const expected = {
    gross,
    refunded,
    net,
    paidOrders,
    ticketsSold,
    aov: averageOrderValueKopecks(net, paidOrders),
    avgTicket: averageTicketPriceKopecks(net, ticketsSold),
    occupancy: ratePercent(seats, capacity),
    attendance: ratePercent(checkIns, ticketsSold),
    noShow,
    onlineShare: ratePercent(online, net),
    cashierShare: ratePercent(cashier, net),
    reservationConversion: reservationConversionRate(paidFromReservations, reservationsCreated),
  };

  const actual = report.kpis;
  const rows: Row[] = [
    {
      metric: "Gross Revenue",
      formula: "Σ PAID Order.totalAmount",
      expected: money(expected.gross),
      actual: money(actual.grossRevenueKopecks),
      status: expected.gross === actual.grossRevenueKopecks ? "PASS" : "FAIL",
    },
    {
      metric: "Refunded Amount",
      formula: "Σ COMPLETED Refund.amount",
      expected: money(expected.refunded),
      actual: money(actual.refundedAmountKopecks),
      status: expected.refunded === actual.refundedAmountKopecks ? "PASS" : "FAIL",
    },
    {
      metric: "Net Revenue",
      formula: "max(0, Gross − Refunded)",
      expected: money(expected.net),
      actual: money(actual.netRevenueKopecks),
      status: expected.net === actual.netRevenueKopecks ? "PASS" : "FAIL",
    },
    {
      metric: "Paid Orders",
      formula: "count PAID orders",
      expected: expected.paidOrders,
      actual: actual.paidOrders,
      status: expected.paidOrders === actual.paidOrders ? "PASS" : "FAIL",
    },
    {
      metric: "Tickets Sold",
      formula: "count VALID|USED tickets on PAID",
      expected: expected.ticketsSold,
      actual: actual.ticketsSold,
      status: expected.ticketsSold === actual.ticketsSold ? "PASS" : "FAIL",
    },
    {
      metric: "AOV",
      formula: "Net / Paid Orders",
      expected: money(expected.aov),
      actual: money(actual.averageOrderValueKopecks),
      status: expected.aov === actual.averageOrderValueKopecks ? "PASS" : "FAIL",
    },
    {
      metric: "Average Ticket Price",
      formula: "Net / Tickets Sold",
      expected: money(expected.avgTicket),
      actual: money(actual.averageTicketPriceKopecks),
      status: expected.avgTicket === actual.averageTicketPriceKopecks ? "PASS" : "FAIL",
    },
    {
      metric: "Occupancy",
      formula: "paid seats / capacity",
      expected: expected.occupancy.toFixed(6),
      actual: actual.occupancyRate.toFixed(6),
      status: Math.abs(expected.occupancy - actual.occupancyRate) < 1e-9 ? "PASS" : "FAIL",
    },
    {
      metric: "Attendance",
      formula: "SUCCESS check-ins / tickets sold",
      expected: expected.attendance.toFixed(6),
      actual: actual.attendanceRate.toFixed(6),
      status: Math.abs(expected.attendance - actual.attendanceRate) < 1e-9 ? "PASS" : "FAIL",
    },
    {
      metric: "No-show",
      formula: "past VALID without SUCCESS check-in",
      expected: expected.noShow,
      actual: actual.noShow,
      status: expected.noShow === actual.noShow ? "PASS" : "FAIL",
    },
    {
      metric: "Online Share",
      formula: "online revenue / Net",
      expected: expected.onlineShare.toFixed(6),
      actual: ratePercent(actual.onlineRevenueKopecks, actual.netRevenueKopecks).toFixed(6),
      status:
        Math.abs(
          expected.onlineShare - ratePercent(actual.onlineRevenueKopecks, actual.netRevenueKopecks),
        ) < 1e-9
          ? "PASS"
          : "FAIL",
    },
    {
      metric: "Cashier Share",
      formula: "cashier revenue / Net",
      expected: expected.cashierShare.toFixed(6),
      actual: ratePercent(actual.cashierRevenueKopecks, actual.netRevenueKopecks).toFixed(6),
      status:
        Math.abs(
          expected.cashierShare -
            ratePercent(actual.cashierRevenueKopecks, actual.netRevenueKopecks),
        ) < 1e-9
          ? "PASS"
          : "FAIL",
    },
    {
      metric: "Reservation Conversion",
      formula: "PAID with reservationId / reservations created",
      expected: expected.reservationConversion.toFixed(6),
      actual: actual.reservationConversionRate.toFixed(6),
      status:
        Math.abs(expected.reservationConversion - actual.reservationConversionRate) < 1e-9
          ? "PASS"
          : "FAIL",
    },
  ];

  const fails = rows.filter((r) => r.status === "FAIL").length;
  const coverage = {
    locations,
    cashiers,
    hasCash: (cashPay._sum.amount ?? 0) > 0,
    hasCard: (cardPay._sum.amount ?? 0) > 0,
    hasYookassa: (sitePay._sum.amount ?? 0) > 0,
    hasOnline: online > 0,
    hasCashier: cashier > 0,
    paidOrders,
    ticketsSold,
    checkIns,
    noShow,
  };

  const md = `# Analytics manual verification (RC2)

Generated: ${new Date().toISOString()}  
Period: last_30 in \`${timeZone}\`  
From: \`${from.toISOString()}\`  
To: \`${to.toISOString()}\`

## Fixture coverage in DB

| Check | Value |
|---|---|
| Active locations | ${coverage.locations} |
| Active cashiers | ${coverage.cashiers} |
| Online PAID revenue | ${coverage.hasOnline ? "yes" : "no"} |
| Cashier PAID revenue | ${coverage.hasCashier ? "yes" : "no"} |
| CASH payments | ${coverage.hasCash ? "yes" : "no"} |
| CARD_TERMINAL payments | ${coverage.hasCard ? "yes" : "no"} |
| CARD_ONLINE / YooKassa | ${coverage.hasYookassa ? "yes" : "no"} |
| Paid orders | ${coverage.paidOrders} |
| Tickets sold | ${coverage.ticketsSold} |
| Check-ins | ${coverage.checkIns} |
| No-show | ${coverage.noShow} |

## Metric reconciliation (independent Prisma vs analytics report)

| Metric | Formula | Expected | Actual | Status |
|---|---|---|---|---|
${rows
  .map((r) => `| ${r.metric} | ${r.formula} | ${r.expected} | ${r.actual} | **${r.status}** |`)
  .join("\n")}

## Summary

- Checks: ${rows.length}
- PASS: ${rows.length - fails}
- FAIL: ${fails}
- Overall: **${fails === 0 ? "PASS" : "FAIL"}**

Money amounts shown in rubles for readability; API stores kopecks.
`;

  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/analytics-manual-verification.md", md);
  console.log(md);
  console.log(`\nWrote docs/analytics-manual-verification.md (${fails === 0 ? "PASS" : "FAIL"})`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
