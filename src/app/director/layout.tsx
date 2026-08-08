import "@/styles/internal.css";
import "./director.css";
import { DirectorLayoutClient } from "@/components/director/DirectorLayoutClient";

export default function DirectorLayout({ children }: { children: React.ReactNode }) {
  return <DirectorLayoutClient>{children}</DirectorLayoutClient>;
}
