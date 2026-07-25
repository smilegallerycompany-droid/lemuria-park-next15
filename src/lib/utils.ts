import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const formatMoney = (value: number) => new Intl.NumberFormat("ru-RU").format(value) + " ₽";

const KOPECKS_PER_RUBLE = 100;

/** Formats a server-provided kopecks amount (see Prisma schema) as a rouble string. */
export const formatMoneyFromKopecks = (kopecks: number) => formatMoney(kopecks / KOPECKS_PER_RUBLE);
