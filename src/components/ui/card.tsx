import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "solid" | "glass" | "soft";
}

export function Card({ className, variant = "solid", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl",
        variant === "solid" && "border border-border/80 bg-white shadow-card",
        variant === "glass" && "glass",
        variant === "soft" && "border border-beige bg-cream/80 shadow-soft",
        className,
      )}
      {...props}
    />
  );
}
