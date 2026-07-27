/**
 * Normalizes a customer-entered phone number for storage:
 *  - strips spaces, parentheses and dashes;
 *  - keeps a leading "+" if present;
 *  - a Russian-style local number written as `8XXXXXXXXXX` (11 digits,
 *    starting with 8) is normalized to `+7XXXXXXXXXX`;
 *  - any other (already-international) number is left as-is, just
 *    stripped of formatting — never re-interpreted as Russian.
 */
export function normalizePhone(input: string): string {
  const stripped = input.trim().replace(/[\s()-]/g, "");
  const hasPlus = stripped.startsWith("+");
  const digits = stripped.replace(/\D/g, "");

  if (!hasPlus && digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }

  if (hasPlus) {
    return `+${digits}`;
  }

  // No leading "+" and not a recognizable RU-local pattern — keep the
  // digits as typed rather than guessing a country code.
  return digits;
}
