"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  decreaseLabel?: string;
  increaseLabel?: string;
  valueLabel?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { button: "size-9", value: "w-8 text-base", icon: 14 },
  md: { button: "size-11", value: "w-10 text-lg", icon: 16 },
  lg: { button: "size-12", value: "w-12 text-xl", icon: 18 },
} as const;

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
  const s = sizeMap[size];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-2xl border border-beige/80 bg-white/90 p-1 shadow-sm",
        className,
      )}
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={decrease}
        disabled={disabled || value <= min}
        aria-label={decreaseLabel}
        className={cn(
          "grid place-items-center rounded-xl text-forest transition enabled:hover:bg-cream disabled:pointer-events-none disabled:opacity-35",
          s.button,
        )}
      >
        <Minus size={s.icon} strokeWidth={2.5} />
      </motion.button>
      <motion.b
        key={value}
        initial={{ scale: 0.85, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className={cn("text-center font-display font-semibold tabular-nums text-forest", s.value)}
        aria-live="polite"
        aria-label={valueLabel ? `${valueLabel}: ${value}` : undefined}
      >
        {value}
      </motion.b>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={increase}
        disabled={disabled || value >= max}
        aria-label={increaseLabel}
        className={cn(
          "grid place-items-center rounded-xl text-forest transition enabled:hover:bg-orange-soft enabled:hover:text-orange disabled:pointer-events-none disabled:opacity-35",
          s.button,
        )}
      >
        <Plus size={s.icon} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}
