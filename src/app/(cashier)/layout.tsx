import type { Metadata } from "next";
import { CashierShell } from "@/components/cashier/cashier-shell";
import "@/styles/internal-tokens.css";
import "./cashier.css";

export const metadata: Metadata = {
  title: "Касса — Лемурия Парк",
  robots: { index: false, follow: false },
  manifest: "/cashier-manifest.webmanifest",
  themeColor: "#1f6b45",
  appleWebApp: {
    capable: true,
    title: "Лемурия Касса",
    statusBarStyle: "default",
  },
};

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  return <CashierShell>{children}</CashierShell>;
}
