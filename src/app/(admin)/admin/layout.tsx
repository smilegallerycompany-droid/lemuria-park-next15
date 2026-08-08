import "@/styles/internal.css";
import "@/app/director/director.css";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
