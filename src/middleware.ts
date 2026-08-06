import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const STAFF_PREFIXES = ["/cashier", "/director", "/admin", "/staff"];

function isStaffPath(pathname: string): boolean {
  return STAFF_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function createRequestId(): string {
  // Edge-safe id (Web Crypto).
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Edge middleware: security headers, correlation id, noindex for staff / staging.
 * Does not rewrite public design or alter booking domain logic.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  const incoming = request.headers.get("x-request-id");
  const requestId =
    incoming && /^[a-zA-Z0-9._-]{8,64}$/.test(incoming) ? incoming : createRequestId();
  response.headers.set("X-Request-Id", requestId);

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.yookassa.ru",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );

  const deployEnv = process.env.DEPLOY_ENV ?? "";
  const stagingNoindex = deployEnv === "staging";

  if (stagingNoindex || isStaffPath(pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
