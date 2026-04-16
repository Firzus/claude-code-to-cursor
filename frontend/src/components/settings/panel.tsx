import type { ReactNode } from "react";
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

export function Panel({
  index,
  title,
  hint,
  footer,
  children,
  className,
  delay = 0,
  status = "idle",
}: PanelProps) {
  return (
    <section
      className={cn(
        "relative w-full rounded-lg border border-border bg-card/40 backdrop-blur-sm font-mono",
        "shadow-[0_0_0_1px_oklch(from_var(--color-border)_l_c_h/0.4)]",
        "animate-fade-in",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
        <div className="flex items-baseline gap-2 min-w-0">
          {index && <span className="text-muted-foreground/60 tabular">{index}</span>}
          <span className="text-foreground/90 truncate">{title}</span>
        </div>
        {hint && (
          <span className="hidden sm:inline text-[10px] text-muted-foreground/70 tracking-[0.14em] truncate">
            {hint}
          </span>
        )}
      </header>

      <div className="px-4 py-3">{children}</div>

      {footer && (
        <footer className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {footer}
        </footer>
      )}

      {status === "active" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-accent/15"
        />
      )}
    </section>
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
