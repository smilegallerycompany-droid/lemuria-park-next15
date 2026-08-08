import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const staging =
    process.env.APP_ENV === "staging" ||
    process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
    process.env.STAGING === "1";

  if (staging) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/cashier", "/director", "/admin", "/staff", "/api/"],
    },
    sitemap: "https://lemuriapark.ru/sitemap.xml",
  };
}
