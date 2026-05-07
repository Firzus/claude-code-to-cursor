"use client";

import type { ReactNode } from "react";
import { cn } from "~/lib/cn";

interface HoverLiftProps {
  children: ReactNode;
  className?: string;
  /** Lift in px on hover. Default: 1. */
  lift?: number;
  /** When true, also shifts a child marked `data-hover-target="border"` to primary/30. */
  borderShift?: boolean;
}

/**
 * CSS-only hover lift. Animates `transform` (translateY) only and is gated
 * behind `(hover: hover) and (pointer: fine)` via the `hover-only:` variant
 * so touch devices stay neutral. Press feedback (`scale(0.97)`) inherits from
 * the global button rule when this wraps an interactive element.
 *
 * @example
 *   <HoverLift><Link href="/">Card</Link></HoverLift>
 *   <HoverLift lift={2} borderShift>...</HoverLift>
 */
export function HoverLift({ children, className, lift = 1, borderShift = false }: HoverLiftProps) {
  const liftStyle = { ["--hover-lift" as string]: `-${lift}px` } as React.CSSProperties;
  return (
    <div
      style={liftStyle}
      className={cn(
        "transition-transform duration-200 ease-out motion-reduce:transition-none",
        "hover-only:hover:[transform:translateY(var(--hover-lift))]",
        "hover-only:focus-within:[transform:translateY(var(--hover-lift))]",
        borderShift &&
          "[&_[data-hover-target=border]]:transition-colors hover-only:hover:[&_[data-hover-target=border]]:border-primary/30",
        className,
      )}
    >
      {children}
    </div>
  );
}
