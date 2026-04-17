import type { LucideIcon } from "lucide-react";
import { Card } from "~/components/ui/card";
import { cn } from "~/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  /** Colour key pulled from `--color-*` (success, warning, accent, chart-1…). */
  accent?: string;
  className?: string;
}

/**
 * Compact metric tile used on Analytics. Unified version — the previous local
 * `BudgetStat` copy in `analytics.tsx` has been removed.
 */
export function StatCard({ icon: Icon, label, value, sub, accent, className }: StatCardProps) {
  return (
    <Card variant="flat" padding="default" className={cn("group", className)}>
      <div className="flex items-center gap-2 mb-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-sm border border-border/70"
          style={
            accent
              ? {
                  backgroundColor: `color-mix(in oklch, var(--color-${accent}) 14%, transparent)`,
                  color: `var(--color-${accent})`,
                  borderColor: `color-mix(in oklch, var(--color-${accent}) 30%, transparent)`,
                }
              : { color: "var(--color-muted-foreground)" }
          }
        >
          <Icon className="h-3 w-3" />
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground truncate">
          {label}
        </span>
      </div>
      <div className="font-mono text-[22px] leading-none font-semibold tabular tracking-tight">
        {value}
      </div>
      {sub && (
        <div className="mt-1 font-mono text-[11px] text-muted-foreground/80 tracking-tight">
          {sub}
        </div>
      )}
    </Card>
  );
}
