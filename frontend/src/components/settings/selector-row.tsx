import type { LucideIcon } from "lucide-react";
import { cn } from "~/lib/utils";

interface SelectorRowProps {
  id: string;
  name: string;
  meta: string;
  selected: boolean;
  onSelect: () => void;
  icon?: LucideIcon;
  accentClass?: string;
  ariaLabel?: string;
}

export function SelectorRow({
  id,
  name,
  meta,
  selected,
  onSelect,
  icon: Icon,
  accentClass,
  ariaLabel,
}: SelectorRowProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel ?? name}
      data-state={selected ? "checked" : "unchecked"}
      onClick={onSelect}
      className={cn(
        "selector-row group relative flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all duration-150 cursor-pointer",
        "border-l-2",
        selected
          ? "border-l-accent bg-card/70"
          : "border-l-transparent hover:border-l-border hover:bg-card/40",
        accentClass,
      )}
    >
      {Icon && (
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border transition-colors",
            selected
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border bg-background/40 text-muted-foreground group-hover:text-foreground/70",
          )}
          aria-hidden="true"
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}

      <div className="min-w-0 flex-1 flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-[13px] tracking-tight transition-colors",
            selected ? "text-foreground" : "text-foreground/80 group-hover:text-foreground",
          )}
        >
          {id}
        </span>
        <span className="text-muted-foreground/60" aria-hidden="true">
          ·
        </span>
        <span className="font-mono text-[11px] text-muted-foreground truncate">{meta}</span>
      </div>

      <span
        aria-hidden="true"
        className={cn(
          "ml-auto font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
          selected ? "text-accent" : "text-muted-foreground/30 group-hover:text-muted-foreground",
        )}
      >
        {selected ? "[●]" : "[ ]"}
      </span>

      {/* Sub-label hidden visually for screen readers / accessible name */}
      <span className="sr-only">{name}</span>
    </button>
  );
}
