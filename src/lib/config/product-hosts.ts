/**
 * Product surface from hostname. Hostname never grants a role —
 * it only selects which UI prefix to serve before DNS cutover.
 *
 * Owner host is recognized so we can refuse to publish /admin as Owner.
 */
import { toAsciiHostname } from "@/lib/config/idn-host";

export type ProductSurface = "cashier" | "director" | "owner";

export function productSurfaceFromHostname(hostname: string | null): ProductSurface | null {
  if (!hostname) return null;
  const host = toAsciiHostname(hostname);
  if (host.startsWith("cashier.")) return "cashier";
  if (host.startsWith("admin.")) return "director";
  if (host.startsWith("owner.")) return "owner";
  return null;
}

export function productHomePath(surface: ProductSurface): string {
  if (surface === "cashier") return "/cashier";
  if (surface === "director") return "/director";
  return "/owner-unavailable";
}

/** Rewrite `/` on a product host to that product's home. Other paths stay as-is. */
export function rewritePathForProductHost(
  pathname: string,
  surface: ProductSurface | null,
): string | null {
  if (!surface) return null;
  if (surface === "owner") {
    if (pathname === "/owner-unavailable") return null;
    return "/owner-unavailable";
  }
  if (pathname !== "/") return null;
  return productHomePath(surface);
}

export function wwwApexHostname(hostname: string | null): string | null {
  if (!hostname) return null;
  const host = toAsciiHostname(hostname);
  if (!host.startsWith("www.")) return null;
  return host.slice(4);
}
