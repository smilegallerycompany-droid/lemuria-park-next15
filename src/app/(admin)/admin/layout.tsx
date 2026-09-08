import "@/styles/internal.css";
import "@/app/director/director.css";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
