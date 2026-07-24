import * as React from "react";
import { cn } from "@/lib/utils";

const sizeMap = {
  xs: "1rem",
  sm: "1.5rem",
  md: "2rem",
  lg: "3rem",
  xl: "4rem",
} as const;

export interface SpacerProps {
  size?: keyof typeof sizeMap;
  axis?: "horizontal" | "vertical";
  className?: string;
}

export function Spacer({ size = "md", axis = "vertical", className }: SpacerProps) {
  const style: React.CSSProperties =
    axis === "vertical"
      ? { height: sizeMap[size], width: "100%" }
      : { width: sizeMap[size], height: "100%" };

  return <div aria-hidden="true" style={style} className={cn("shrink-0", className)} />;
}
