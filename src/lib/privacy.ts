/**
 * Masking helpers for PII that must never leave the server unmasked in a
 * public response (see PublicOrderDto: `maskedPhone`, `maskedEmail`).
 */

const MASK_CHAR = "•";

/** "+79001234567" -> "+79•••••••67" */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 4) {
    return MASK_CHAR.repeat(trimmed.length);
  }
  const start = trimmed.slice(0, 3);
  const end = trimmed.slice(-2);
  const maskedLength = Math.max(trimmed.length - start.length - end.length, 3);
  return `${start}${MASK_CHAR.repeat(maskedLength)}${end}`;
}

/** "ivan@example.com" -> "iv••@example.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split("@");
  if (!domain) {
    return MASK_CHAR.repeat(Math.max(email.length, 3));
  }
  const visible = local.slice(0, Math.min(2, local.length));
  const maskedLength = Math.max(local.length - visible.length, 2);
  return `${visible}${MASK_CHAR.repeat(maskedLength)}@${domain}`;
}
