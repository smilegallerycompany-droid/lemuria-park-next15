import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageSectionProps extends React.HTMLAttributes<HTMLElement> {
  tone?: "default" | "jungle" | "surface";
}

export function PageSection({ className, tone = "default", ...props }: PageSectionProps) {
  return (
    <section
      className={cn(
        "py-16",
        tone === "jungle" && "jungle-bg",
        tone === "surface" && "bg-surface",
        className,
      )}
      {...props}
    />
  );
}
