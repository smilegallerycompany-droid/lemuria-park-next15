import { timingSafeEqual } from "node:crypto";

export function secretsEqual(provided: string, expected: string): boolean {
  const actualBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) {
    timingSafeEqual(expectedBytes, expectedBytes);
    return false;
  }
  return timingSafeEqual(actualBytes, expectedBytes);
}
