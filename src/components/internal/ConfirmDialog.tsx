"use client";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  danger,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="internal-dialog-backdrop">
      <button
        type="button"
        className="internal-dialog-scrim"
        aria-label="Закрыть диалог"
        onClick={onCancel}
      />
      <div
        className="internal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="internal-dialog-title"
      >
        <h2 id="internal-dialog-title">{title}</h2>
        {description ? <p>{description}</p> : null}
        <div className="internal-dialog-actions">
          <button type="button" className="internal-btn secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`internal-btn ${danger ? "danger" : "primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
