import type { LucideIcon } from "lucide-react";
import { cn } from "~/lib/utils";

interface FeatureCardProps {
  index: string;
  title: string;
  description: string;
  icon: LucideIcon;
  items: string[];
  delay?: number;
}

export function FeatureCard({
  index,
  title,
  description,
  icon: Icon,
  items,
  delay = 0,
}: FeatureCardProps) {
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-5 rounded-lg border border-border bg-card/30 p-6",
        "transition-all duration-300 hover:-translate-y-0.5 hover:border-border/70 hover:bg-card/60",
        "animate-fade-in",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {index}
        </span>
        <span className="rounded-md border border-border/80 bg-background/60 p-1.5 text-muted-foreground transition-colors group-hover:border-accent/50 group-hover:text-accent">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>

      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>

      <ul className="mt-auto space-y-1.5 font-mono text-[11px] text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex items-baseline gap-2">
            <span aria-hidden="true" className="text-accent">
              →
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
