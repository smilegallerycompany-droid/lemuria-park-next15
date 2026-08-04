import type { Metadata } from "next";
import { CashierShell } from "@/components/cashier/cashier-shell";
import "./cashier.css";

export const metadata: Metadata = {
  title: "Касса — Лемурия Парк",
  robots: { index: false, follow: false },
};

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  return <CashierShell>{children}</CashierShell>;
}
