import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  /** Colour tone for the icon tile. Defaults to `muted`. */
  tone?: "muted" | "destructive" | "warning" | "success" | "accent";
}

const toneStyles: Record<NonNullable<EmptyStateProps["tone"]>, string> = {
  muted: "border-border/60 bg-muted/40 text-muted-foreground",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-success/30 bg-success/10 text-success",
  accent: "border-accent/30 bg-accent/10 text-accent",
};

/**
 * Unified placeholder used for empty lists, error fallbacks, and any zero-state.
 * Follows the terminal aesthetic: tiny ASCII eyebrow + mono title.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  tone = "muted",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-14 px-6 text-center animate-fade-in",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-md border mb-4",
          toneStyles[tone],
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="font-mono text-[13px] font-medium text-foreground mb-1.5 tracking-tight">
        {title}
      </h3>
      <p className="text-[12px] text-muted-foreground max-w-xs leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
