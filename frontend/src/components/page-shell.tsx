import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface PageShellProps {
  children: ReactNode;
  /** Page max-width class. Defaults to the standard `max-w-5xl`. */
  width?: "sm" | "md" | "lg" | "xl" | "wide";
  className?: string;
}

const widthMap = {
  sm: "max-w-xl",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-4xl",
  wide: "max-w-5xl",
} as const;

/**
 * Standard page container. Ensures identical horizontal spacing and max-width
 * across every route. Use `width="lg"` for form-style pages (settings, setup),
 * `width="wide"` (default) for dashboards, and no shell for landing pages that
 * need full-bleed treatment.
 */
export function PageShell({ children, width = "wide", className }: PageShellProps) {
  return (
    <div
      className={cn("mx-auto w-full px-1 space-y-6 animate-fade-in", widthMap[width], className)}
    >
      {children}
    </div>
  );
}
