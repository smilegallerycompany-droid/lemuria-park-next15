import { randomBytes } from "crypto";

const HEADER = "x-request-id";

/** Generate a short opaque correlation id (not a secret). */
export function createRequestId(): string {
  return randomBytes(8).toString("hex");
}

export function readRequestId(request: Request): string {
  const incoming = request.headers.get(HEADER)?.trim();
  if (incoming && /^[a-zA-Z0-9._-]{8,64}$/.test(incoming)) {
    return incoming;
  }
  return createRequestId();
}

export { HEADER as REQUEST_ID_HEADER };
