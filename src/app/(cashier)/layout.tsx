import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CashierShell } from "@/components/cashier/cashier-shell";
import { getStaffSessionUser } from "@/server/auth/staff-session";
import { cashierGate } from "@/server/auth/cashier-entry";
import "@/styles/internal.css";
import "./cashier.css";

export const dynamic = "force-dynamic";

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

export default async function CashierLayout({ children }: { children: React.ReactNode }) {
  const user = await getStaffSessionUser();
  if (cashierGate(user, "app") === "redirect-login") {
    redirect("/cashier/login");
  }
  return <CashierShell>{children}</CashierShell>;
}
