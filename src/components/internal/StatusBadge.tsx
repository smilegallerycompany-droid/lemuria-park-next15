type Tone = "success" | "warning" | "danger" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  PAID: "success",
  VALID: "success",
  USED: "neutral",
  ACTIVE: "success",
  OPEN: "success",
  SUCCEEDED: "success",
  AWAITING_PAYMENT: "warning",
  PENDING: "warning",
  UPCOMING: "warning",
  PAUSED: "warning",
  CANCELLED: "danger",
  REFUNDED: "danger",
  EXPIRED: "danger",
  DISABLED: "danger",
  FAILED: "danger",
  CLOSED: "neutral",
};

type Props = {
  label: string;
  tone?: Tone;
  status?: string;
};

export function StatusBadge({ label, tone, status }: Props) {
  const resolved = tone ?? (status ? STATUS_TONE[status] ?? "neutral" : "neutral");
  return <span className={`internal-badge ${resolved}`}>{label}</span>;
}
