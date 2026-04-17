import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./ui/card";

interface FeatureTileProps {
  index: string;
  title: string;
  description: string;
  icon: LucideIcon;
  items?: readonly string[];
  delay?: number;
  children?: ReactNode;
  /** Compact variant removes the items footer and tightens padding. */
  compact?: boolean;
}

/**
 * Unified feature tile — replaces `FeatureCard` (home) and `FeatureBlock`
 * (setup welcome). Terminal-flavoured: `INDEX · TITLE` eyebrow, icon in a
 * bordered square, body prose, optional arrow-prefixed list.
 */
export function FeatureTile({
  index,
  title,
  description,
  icon: Icon,
  items,
  delay,
  children,
  compact = false,
}: FeatureTileProps) {
  return (
    <Card
      variant="terminal"
      padding="none"
      lift
      delay={delay}
      className="group flex flex-col gap-4"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-2.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
          {index}
        </span>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-border/70 bg-background/60 text-muted-foreground transition-colors group-hover:border-accent/50 group-hover:text-accent">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </header>

      <div className="flex flex-col gap-3 px-4 pb-4">
        <div>
          <h3 className="font-mono text-[14px] font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>

        {!compact && items && items.length > 0 && (
          <ul className="mt-auto space-y-1 border-t border-border/40 pt-3 font-mono text-[11px] text-muted-foreground">
            {items.map((item) => (
              <li key={item} className="flex items-baseline gap-2">
                <span aria-hidden="true" className="text-accent">
                  →
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {children}
      </div>
    </Card>
  );
}
