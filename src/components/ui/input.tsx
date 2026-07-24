import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-12 w-full rounded-xl border border-border bg-white px-4 text-sm transition placeholder:text-muted-foreground focus-visible:border-green-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-500/10",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
