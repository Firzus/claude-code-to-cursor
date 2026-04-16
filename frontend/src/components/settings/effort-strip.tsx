import { cn } from "~/lib/utils";

interface EffortStripProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}

export function EffortStrip<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: EffortStripProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-disabled={disabled}
      className={cn(
        "grid rounded-md border border-border/70 bg-card/30 font-mono text-[11px] overflow-hidden",
        disabled && "opacity-30 pointer-events-none",
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option, i) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={cn(
              "relative px-2 py-1.5 text-center uppercase tracking-[0.16em] transition-all duration-150 cursor-pointer",
              i > 0 && "border-l border-border/40",
              active
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-card/60",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
