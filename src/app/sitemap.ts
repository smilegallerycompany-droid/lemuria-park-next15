import type { MetadataRoute } from "next";
import { displayOriginFromUrl } from "@/lib/config/public-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  const staging =
    process.env.APP_ENV === "staging" ||
    process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
    process.env.STAGING === "1";
  if (staging) return [];

  const raw = process.env.NEXT_PUBLIC_APP_URL || "https://xn--80akjgfhqje3a8k.xn--p1ai";
  let origin = raw.replace(/\/$/, "");
  try {
    origin = displayOriginFromUrl(raw);
  } catch {
    /* keep origin */
  }

  const paths = ["/", "/tickets", "/about", "/location", "/policy", "/offer"];
  const lastModified = new Date();
  return paths.map((path) => ({
    url: `${origin}${path === "/" ? "" : path}`,
    lastModified,
  }));
}
