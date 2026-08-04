/** Public DTOs for the order endpoints. Never a Prisma model — safe to use in React. */

export interface PublicOrderSessionDto {
  publicId: string;
  startsAt: string;
  localDate: string;
  localTime: string;
  city: string;
  venue: string;
  address: string;
  timezone: string;
}

export interface PublicOrderItemDto {
  ticketTypeCode: string;
  ticketTypeName: string;
  quantity: number;
  /** Kopecks. */
  unitPrice: number;
  /** Kopecks — `quantity * unitPrice`. */
  subtotal: number;
}

export interface PublicOrderDto {
  /** Safe, non-guessable, human-friendly identifier (never the internal database id). */
  number: string;
  status: string;
  /** Null when ЮKassa is not configured or no payment row exists yet. */
  paymentStatus: string | null;
  /** YooKassa redirect URL — null when payment provider is not configured. */
  confirmationUrl: string | null;
  /** True only when YUKASSA_* credentials are present. */
  paymentConfigured: boolean;
  customerName: string;
  maskedPhone: string;
  maskedEmail: string;
  /** Kopecks. */
  totalAmount: number;
  createdAt: string;
  /** Deadline to complete payment before the order is auto-released. Null once resolved (paid/cancelled). */
  paymentExpiresAt: string | null;
  session: PublicOrderSessionDto;
  items: PublicOrderItemDto[];
  /** Present only for PAID orders after ticket issuance. */
  tickets: Array<{ publicId: string; qrToken: string; status: string }>;
}
