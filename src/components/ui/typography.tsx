import * as React from "react";
import { cn } from "@/lib/utils";

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";
type TextTag = "p" | "span" | "div";

export interface HeadingProps extends React.HTMLAttributes<HTMLElement> {
  /** Render a different tag while keeping the visual style, e.g. to avoid duplicate <h1>s. */
  as?: HeadingTag;
}

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  as?: TextTag;
}

/** Polymorphic tags don't have a single concrete ref type, so we widen and re-narrow explicitly. */
function toHeadingRef(ref: React.ForwardedRef<HTMLElement>) {
  return ref as unknown as React.Ref<HTMLHeadingElement>;
}
function toTextRef(ref: React.ForwardedRef<HTMLElement>) {
  return ref as unknown as React.Ref<HTMLParagraphElement>;
}

export const H1 = React.forwardRef<HTMLElement, HeadingProps>(function H1(
  { as: Tag = "h1", className, children, ...props },
  ref,
) {
  return (
    <Tag
      ref={toHeadingRef(ref)}
      className={cn("text-4xl font-black tracking-tight md:text-5xl", className)}
      {...props}
    >
      {children}
    </Tag>
  );
});
H1.displayName = "H1";

export const H2 = React.forwardRef<HTMLElement, HeadingProps>(function H2(
  { as: Tag = "h2", className, children, ...props },
  ref,
) {
  return (
    <Tag
      ref={toHeadingRef(ref)}
      className={cn("text-3xl font-black tracking-tight md:text-4xl", className)}
      {...props}
    >
      {children}
    </Tag>
  );
});
H2.displayName = "H2";

export const H3 = React.forwardRef<HTMLElement, HeadingProps>(function H3(
  { as: Tag = "h3", className, children, ...props },
  ref,
) {
  return (
    <Tag
      ref={toHeadingRef(ref)}
      className={cn("text-xl font-extrabold tracking-tight md:text-2xl", className)}
      {...props}
    >
      {children}
    </Tag>
  );
});
H3.displayName = "H3";

export const Lead = React.forwardRef<HTMLElement, TextProps>(function Lead(
  { as: Tag = "p", className, children, ...props },
  ref,
) {
  return (
    <Tag
      ref={toTextRef(ref)}
      className={cn("text-lg leading-8 text-muted-foreground", className)}
      {...props}
    >
      {children}
    </Tag>
  );
});
Lead.displayName = "Lead";

export const Body = React.forwardRef<HTMLElement, TextProps>(function Body(
  { as: Tag = "p", className, children, ...props },
  ref,
) {
  return (
    <Tag
      ref={toTextRef(ref)}
      className={cn("text-base leading-7 text-foreground", className)}
      {...props}
    >
      {children}
    </Tag>
  );
});
Body.displayName = "Body";

export const Caption = React.forwardRef<HTMLElement, TextProps>(function Caption(
  { as: Tag = "span", className, children, ...props },
  ref,
) {
  return (
    <Tag
      ref={toTextRef(ref)}
      className={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}
      {...props}
    >
      {children}
    </Tag>
  );
});
Caption.displayName = "Caption";
