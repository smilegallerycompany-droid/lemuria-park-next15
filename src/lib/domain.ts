export { SITE } from "@/constants/site";
export const PRICES = { adult: 800, child: 600, toddler: 0 } as const;
export type TicketCounts = { adult: number; child: number; toddler: number };
