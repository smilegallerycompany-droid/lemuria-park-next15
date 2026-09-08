import type { Metadata } from "next";
import { Manrope, Unbounded } from "next/font/google";
import { displayOriginFromUrl } from "@/lib/config/public-origin";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  display: "swap",
});

function metadataBaseUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "https://xn--80akjgfhqje3a8k.xn--p1ai";
  try {
    return new URL(displayOriginFromUrl(raw));
  } catch {
    return new URL(raw);
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  title: "Лемурия Парк. Зоотеатр лемуров",
  description: "Зоотеатр лемуров в Краснодаре. Онлайн-покупка билетов по сеансам.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Лемурия Парк",
    title: "Лемурия Парк. Зоотеатр лемуров",
    description: "Зоотеатр лемуров в Краснодаре. Онлайн-покупка билетов по сеансам.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
