import * as React from "react";
import { cn } from "@/lib/utils";

export interface ImagePlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** CSS aspect-ratio value, e.g. "16 / 9" or "1 / 1". */
  aspectRatio?: string;
  /** CSS min-height value, e.g. "420px" or "20rem". */
  minHeight?: string;
  /** When true (default), the placeholder is marked aria-hidden since it carries no content. */
  decorative?: boolean;
}

export function ImagePlaceholder({
  className,
  style,
  aspectRatio,
  minHeight,
  decorative = true,
  children,
  ...props
}: ImagePlaceholderProps) {
  return (
    <div
      aria-hidden={decorative || undefined}
      style={{
        ...(aspectRatio ? { aspectRatio } : null),
        ...(minHeight ? { minHeight } : null),
        ...style,
      }}
      className={cn("rounded-3xl bg-gradient-to-br from-green-200 to-green-500", className)}
      {...props}
    >
      {children}
    </div>
  );
}
