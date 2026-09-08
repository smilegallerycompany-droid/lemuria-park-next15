import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  hostnameFromHostHeader,
  isHostAllowed,
  parseAllowedHosts,
  shouldSkipHostAllowlist,
} from "@/lib/config/allowed-hosts";
import { isPrivateTimerRootPost } from "@/lib/config/cron-auth";
import {
  productSurfaceFromHostname,
  rewritePathForProductHost,
  wwwApexHostname,
} from "@/lib/config/product-hosts";

const STAFF_PREFIXES = ["/cashier", "/director", "/admin", "/staff"];

function isStaffPath(pathname: string): boolean {
  return STAFF_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function applySecurityHeaders(request: NextRequest, response: NextResponse, pathname: string) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  const cameraPolicy =
    pathname === "/cashier/scan" || pathname.startsWith("/cashier/scan/")
      ? "camera=(self)"
      : "camera=()";
  response.headers.set(
    "Permissions-Policy",
    `${cameraPolicy}, microphone=(), geolocation=(), payment=()`,
  );
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
  if (stagingNoIndex || isStaffPath(pathname) || pathname === "/owner-unavailable") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

/**
 * Edge middleware: host allowlist, product-host rewrite of `/`, security headers.
 * Hostname never grants a role — layouts and APIs re-check the session.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const timerRoot = isPrivateTimerRootPost(request.method, pathname, request.headers);
  if (timerRoot) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/cron/cleanup";
    return NextResponse.rewrite(url);
  }
  const allowed = parseAllowedHosts(process.env.ALLOWED_HOSTS);
  const hostname = hostnameFromHostHeader(request.headers.get("host"));
  if (allowed.length > 0 && !shouldSkipHostAllowlist(pathname)) {
    if (!hostname || !isHostAllowed(hostname, allowed)) {
      return new NextResponse("Unknown host", { status: 421 });
    }
  }

  const apex = wwwApexHostname(hostname);
  if (apex && allowed.length > 0 && isHostAllowed(apex, allowed)) {
    const url = request.nextUrl.clone();
    url.hostname = apex;
    url.protocol = "https:";
    url.port = "";
    return applySecurityHeaders(request, NextResponse.redirect(url, 308), pathname);
  }

  if (shouldSkipHostAllowlist(pathname)) {
    return applySecurityHeaders(request, NextResponse.next(), pathname);
  }

  const surface = productSurfaceFromHostname(hostname);
  const rewritten = rewritePathForProductHost(pathname, surface);
  if (rewritten) {
    const url = request.nextUrl.clone();
    url.pathname = rewritten;
    return applySecurityHeaders(request, NextResponse.rewrite(url), rewritten);
  }

  return applySecurityHeaders(request, NextResponse.next(), pathname);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
