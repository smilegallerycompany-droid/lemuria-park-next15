import * as React from "react";
import { cn } from "@/lib/utils";

const gapMap = {
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-8",
} as const;

const alignMap = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
} as const;

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "column";
  gap?: keyof typeof gapMap;
  align?: keyof typeof alignMap;
}

export function Stack({
  className,
  direction = "column",
  gap = "md",
  align,
  ...props
}: StackProps) {
  return (
    <div
      className={cn(
        "flex",
        direction === "column" ? "flex-col" : "flex-row",
        gapMap[gap],
        align && alignMap[align],
        className,
      )}
      {...props}
    />
  );
}
