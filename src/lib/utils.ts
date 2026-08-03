import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const formatMoney = (value: number) => new Intl.NumberFormat("ru-RU").format(value) + " ₽";

const KOPECKS_PER_RUBLE = 100;

/** Formats a server-provided kopecks amount (see Prisma schema) as a rouble string. */
export const formatMoneyFromKopecks = (kopecks: number) => formatMoney(kopecks / KOPECKS_PER_RUBLE);

export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
