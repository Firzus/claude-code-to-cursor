import type { ReactNode } from "react";
import { Card, CardFooter, CardHeader } from "~/components/ui/card";
import { cn } from "~/lib/utils";

interface PanelProps {
  index?: string;
  title: string;
  hint?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
  status?: "idle" | "active" | "error";
}

/**
 * Settings / setup "panel" — terminal-flavoured surface with header + footer.
 * Thin wrapper over the unified Card primitive; kept as a named export so
 * callers use semantically meaningful names.
 */
export function Panel({
  index,
  title,
  hint,
  footer,
  children,
  className,
  delay,
  status = "idle",
}: PanelProps) {
  return (
    <Card
      variant="panel"
      padding="none"
      delay={delay}
      className={cn("relative font-mono", className)}
    >
      <CardHeader index={index} title={title} hint={hint} />
      <div className="px-4 py-3">{children}</div>
      {footer && <CardFooter>{footer}</CardFooter>}
      {status === "active" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-accent/20"
        />
      )}
    </Card>
  );
}

interface PanelRowProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function PanelRow({ label, children, className }: PanelRowProps) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-1.5 text-[12px] leading-5",
        className,
      )}
    >
      <span className="text-muted-foreground uppercase tracking-[0.14em] text-[10.5px]">
        {label}
      </span>
      <span className="flex items-center gap-2 text-foreground tabular">{children}</span>
    </div>
  );
}
