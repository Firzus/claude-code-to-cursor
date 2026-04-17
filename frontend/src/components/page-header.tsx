import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type StatusTone = "success" | "warning" | "destructive" | "muted" | "accent" | "info";

export interface PageHeaderStatus {
  tone: StatusTone;
  label: ReactNode;
  /** Animate the dot (e.g. for "unsaved" or "watching" states). */
  pulse?: boolean;
}

interface PageHeaderProps {
  /** Breadcrumb-style eyebrow, e.g. `~/analytics`. Rendered with an arrow glyph. */
  eyebrow?: ReactNode;
  /** Page title. Rendered lowercased by default — pass custom content to override. */
  title: ReactNode;
  /** Small trailing subtitle next to the title (terminal-style, e.g. `.control`). */
  subtitle?: ReactNode;
  /** Small version badge on the right of the title line. */
  version?: ReactNode;
  /** Status badge on the right (replaces default). */
  status?: PageHeaderStatus | null;
  /** Right-hand actions (e.g. buttons, a live `AgoText`). Overrides `status` if provided. */
  actions?: ReactNode;
  className?: string;
}

const toneDot: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground/40",
  accent: "bg-accent",
  info: "bg-accent",
};

/**
 * Unified terminal-style page header. Used on Analytics, Settings, Setup,
 * Not-found, etc. — guarantees a consistent H1 size + status slot across the app.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  version,
  status,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-border/60 pb-4 font-mono",
        className,
      )}
    >
      <div className="flex items-baseline gap-3 min-w-0 flex-1">
        <span aria-hidden="true" className="text-muted-foreground/50">
          ↳
        </span>
        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
          {eyebrow && (
            <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground/70 self-center">
              {eyebrow}
            </span>
          )}
          <h1 className="text-[18px] sm:text-[22px] font-semibold tracking-[-0.02em] text-foreground leading-tight">
            {title}
            {subtitle && <span className="text-muted-foreground">{subtitle}</span>}
          </h1>
          {version && (
            <span className="hidden sm:inline text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground/60 self-center">
              {version}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {actions ??
          (status && (
            <span className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em]">
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  toneDot[status.tone],
                  status.pulse && "animate-pulse",
                )}
              />
              <span className="text-muted-foreground">{status.label}</span>
            </span>
          ))}
      </div>
    </header>
  );
}
