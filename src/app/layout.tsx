import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Лемурия Парк — зоотеатр лемуров",
  description: "Живое общение с лемурами и онлайн-покупка билетов по сеансам.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
