import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSessionUser } from "@/server/auth/staff-session";
import { cashierGate } from "@/server/auth/cashier-entry";
import { CashierLoginForm } from "@/components/cashier/cashier-login-form";
import "@/styles/internal.css";
import "@/app/(cashier)/cashier.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Вход кассира — Лемурия Парк",
  robots: { index: false, follow: false },
};

export default async function CashierLoginPage() {
  const user = await getStaffSessionUser();
  if (cashierGate(user, "login") === "redirect-app") {
    redirect("/cashier");
  }
  return <CashierLoginForm />;
}
