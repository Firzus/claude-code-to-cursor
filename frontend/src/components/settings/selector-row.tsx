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
  /** Data attribute driving accent colour (e.g. `opus` → chart-4). */
  dataModel?: "opus" | "sonnet" | "haiku";
}

/**
 * Radio option row with id · meta · check marker. Used in the Settings page
 * for model/plan selection. Kept as a bespoke component because the layout is
 * richer than the generic Segmented control.
 */
export function SelectorRow({
  id,
  name,
  meta,
  selected,
  onSelect,
  icon: Icon,
  accentClass,
  ariaLabel,
  dataModel,
}: SelectorRowProps) {
  const model: SelectorRowProps["dataModel"] =
    dataModel ??
    (accentClass?.includes("opus")
      ? "opus"
      : accentClass?.includes("sonnet")
        ? "sonnet"
        : accentClass?.includes("haiku")
          ? "haiku"
          : undefined);

  return (
    // biome-ignore lint/a11y/useSemanticElements: role=radio on <button> is intentional — native radio inputs can't host rich label + icon + meta layout.
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel ?? name}
      data-state={selected ? "checked" : "unchecked"}
      data-model={model}
      onClick={onSelect}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left cursor-pointer font-mono",
        "transition-[background-color,border-color,color] duration-[var(--duration-base)] ease-[var(--ease-out-quart)]",
        "border-l-2",
        selected
          ? "border-l-accent bg-card/80"
          : "border-l-transparent hover:border-l-border/80 hover:bg-card/40",
      )}
    >
      {Icon && (
        <span
          aria-hidden="true"
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border transition-colors",
            selected
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border/70 bg-background/40 text-muted-foreground group-hover:text-foreground/70",
          )}
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
          "ml-auto font-mono text-[11px] uppercase tracking-[0.18em] transition-colors tabular",
          selected ? "text-accent" : "text-muted-foreground/30 group-hover:text-muted-foreground",
        )}
      >
        {selected ? "[●]" : "[ ]"}
      </span>

      <span className="sr-only">{name}</span>
    </button>
  );
}
