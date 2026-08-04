"use client";

type ConfirmCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id?: string;
};

export function ConfirmCheckbox({ checked, onChange, label, id = "confirm-action" }: ConfirmCheckboxProps) {
  return (
    <label className="director-confirm" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
