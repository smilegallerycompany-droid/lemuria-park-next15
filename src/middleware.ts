import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  hostnameFromHostHeader,
  isHostAllowed,
  parseAllowedHosts,
  shouldSkipHostAllowlist,
} from "@/lib/config/allowed-hosts";

const STAFF_PREFIXES = ["/cashier", "/director", "/admin", "/staff"];

function isStaffPath(pathname: string): boolean {
  return STAFF_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Edge middleware: security headers for all responses + noindex for staff portals.
 * Does not rewrite public design or alter booking domain logic.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const allowed = parseAllowedHosts(process.env.ALLOWED_HOSTS);
  if (allowed.length > 0 && !shouldSkipHostAllowlist(pathname)) {
    const hostname = hostnameFromHostHeader(request.headers.get("host"));
    if (!hostname || !isHostAllowed(hostname, allowed)) {
      return new NextResponse("Unknown host", { status: 421 });
    }
  }

  const response = NextResponse.next();

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Cashier QR scanner needs getUserMedia on same origin; keep camera denied elsewhere.
  const cameraPolicy = pathname === "/cashier/scan" || pathname.startsWith("/cashier/scan/")
    ? "camera=(self)"
    : "camera=()";
  response.headers.set(
    "Permissions-Policy",
    `${cameraPolicy}, microphone=(), geolocation=(), payment=()`,
  );
  // Basic CSP — allows self assets, inline styles from Next, and YooKassa checkout redirects.
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.yookassa.ru",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );

  const stagingNoIndex =
    process.env.APP_ENV === "staging" ||
    process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
    process.env.STAGING === "1";
  if (stagingNoIndex || isStaffPath(pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Apply to all paths except Next internals and common static assets.
     * robots.txt / favicon stay public without CSP noise.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
