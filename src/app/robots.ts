import type { MetadataRoute } from "next";
import { displayOriginFromUrl } from "@/lib/config/public-origin";

function publicOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "https://xn--80akjgfhqje3a8k.xn--p1ai";
  try {
    return displayOriginFromUrl(raw);
  } catch {
    return raw.replace(/\/$/, "");
  }
}

export default function robots(): MetadataRoute.Robots {
  const staging =
    process.env.APP_ENV === "staging" ||
    process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
    process.env.STAGING === "1";
  const origin = publicOrigin();

  if (staging) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/cashier", "/director", "/admin", "/staff", "/owner-unavailable", "/api/"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
