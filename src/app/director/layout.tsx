import "@/styles/internal.css";
import "./director.css";
import { DirectorLayoutClient } from "@/components/director/DirectorLayoutClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DirectorLayout({ children }: { children: React.ReactNode }) {
  return <DirectorLayoutClient>{children}</DirectorLayoutClient>;
}
