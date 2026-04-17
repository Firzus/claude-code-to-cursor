import { cn } from "~/lib/utils";

interface SeparatorProps {
  orientation?: "horizontal" | "vertical";
  variant?: "solid" | "dashed" | "ascii";
  label?: string;
  className?: string;
}

/** Thin divider with optional ASCII label in the middle (terminal-style). */
export function Separator({
  orientation = "horizontal",
  variant = "solid",
  label,
  className,
}: SeparatorProps) {
  if (orientation === "vertical") {
    return (
      <hr
        aria-orientation="vertical"
        className={cn(
          "inline-block h-full w-px self-stretch border-0",
          variant === "dashed" ? "border-l border-dashed border-border" : "bg-border/60",
          className,
        )}
      />
    );
  }

  if (label) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70",
          className,
        )}
      >
        <span
          className={cn(
            "h-px flex-1",
            variant === "dashed" ? "border-t border-dashed border-border/60" : "bg-border/60",
          )}
        />
        <span>{label}</span>
        <span
          className={cn(
            "h-px flex-1",
            variant === "dashed" ? "border-t border-dashed border-border/60" : "bg-border/60",
          )}
        />
      </div>
    );
  }

  if (variant === "ascii") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "select-none font-mono text-[11px] leading-none text-border/80 overflow-hidden",
          className,
        )}
      >
        ──────────────────────────────────────────────────────────────────────
      </div>
    );
  }

  return (
    <hr
      className={cn(
        "my-0 w-full border-0",
        variant === "dashed" ? "border-t border-dashed border-border/60" : "h-px bg-border/60",
        className,
      )}
    />
  );
}
