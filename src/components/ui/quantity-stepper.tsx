"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: { button: "size-8", value: "w-7 text-sm" },
  md: { button: "size-9", value: "w-8 text-base" },
} as const;

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  decreaseLabel?: string;
  increaseLabel?: string;
  /** Accessible name for the value, announced as "{valueLabel}: {value}" via aria-label. */
  valueLabel?: string;
  className?: string;
  size?: keyof typeof sizeClasses;
}

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  disabled = false,
  decreaseLabel = "Уменьшить количество",
  increaseLabel = "Увеличить количество",
  valueLabel,
  className,
  size = "md",
}: QuantityStepperProps) {
  const decrease = () => onChange(Math.max(min, value - step));
  const increase = () => onChange(Math.min(max, value + step));
  const { button: buttonSize, value: valueSize } = sizeClasses[size];

  return (
    <div className={cn("flex items-center overflow-hidden rounded-lg border", className)}>
      <button
        type="button"
        onClick={decrease}
        disabled={disabled || value <= min}
        aria-label={decreaseLabel}
        className={cn(
          "grid place-items-center bg-cream transition disabled:pointer-events-none disabled:opacity-50",
          buttonSize,
        )}
      >
        <Minus size={14} />
      </button>
      <b
        className={cn("text-center", valueSize)}
        aria-live="polite"
        aria-label={valueLabel ? `${valueLabel}: ${value}` : undefined}
      >
        {value}
      </b>
      <button
        type="button"
        onClick={increase}
        disabled={disabled || value >= max}
        aria-label={increaseLabel}
        className={cn(
          "grid place-items-center bg-cream transition disabled:pointer-events-none disabled:opacity-50",
          buttonSize,
        )}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
