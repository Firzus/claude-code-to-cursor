import { cva, type VariantProps } from "class-variance-authority";
import { type KeyboardEvent, type ReactNode, useCallback, useRef } from "react";
import { cn } from "~/lib/utils";

const rootVariants = cva(
  "inline-flex rounded-md border border-border/70 bg-card/30 font-mono overflow-hidden",
  {
    variants: {
      size: {
        sm: "text-[10px] tracking-[0.18em]",
        default: "text-[11px] tracking-[0.16em]",
        lg: "text-[12px] tracking-[0.12em]",
      },
      fullWidth: { true: "w-full grid", false: "inline-flex" },
    },
    defaultVariants: { size: "default", fullWidth: false },
  },
);

const itemVariants = cva(
  [
    "relative uppercase cursor-pointer select-none",
    "transition-[background-color,color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-quart)]",
    "text-muted-foreground hover:text-foreground hover:bg-card/60",
    "aria-checked:bg-foreground aria-checked:text-background aria-checked:font-medium",
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
    "not-first:border-l not-first:border-border/40",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-6 px-2",
        default: "h-7 px-2.5",
        lg: "h-9 px-3.5",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  disabled?: boolean;
  /** Optional `data-accent` for model-tinted items (opus/sonnet/haiku). */
  dataModel?: "opus" | "sonnet" | "haiku";
}

export interface SegmentedProps<V extends string> extends VariantProps<typeof rootVariants> {
  options: readonly SegmentedOption<V>[] | readonly V[];
  value: V;
  onChange: (next: V) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
  /** Map a raw value to a display label when `options` is `readonly V[]`. */
  renderLabel?: (value: V) => ReactNode;
}

function normalise<V extends string>(
  options: SegmentedProps<V>["options"],
  renderLabel?: (value: V) => ReactNode,
): SegmentedOption<V>[] {
  return (options as readonly (V | SegmentedOption<V>)[]).map((opt) =>
    typeof opt === "string" ? { value: opt, label: renderLabel ? renderLabel(opt) : opt } : opt,
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
  className,
  itemClassName,
  size,
  fullWidth,
  renderLabel,
}: SegmentedProps<V>) {
  const items = normalise(options, renderLabel);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAt = useCallback((index: number) => {
    const total = refs.current.length;
    if (!total) return;
    const normalised = ((index % total) + total) % total;
    refs.current[normalised]?.focus();
  }, []);

  const step = useCallback(
    (from: number, dir: 1 | -1) => {
      let idx = from;
      for (let i = 0; i < items.length; i++) {
        idx = (idx + dir + items.length) % items.length;
        if (!items[idx].disabled) return idx;
      }
      return from;
    },
    [items],
  );

  const resolveKey = useCallback((key: string): "forward" | "backward" | "home" | "end" | null => {
    if (key === "ArrowRight" || key === "ArrowDown") return "forward";
    if (key === "ArrowLeft" || key === "ArrowUp") return "backward";
    if (key === "Home") return "home";
    if (key === "End") return "end";
    return null;
  }, []);

  const moveFocus = useCallback(
    (action: "forward" | "backward" | "home" | "end", fromIdx: number) => {
      if (action === "home") return focusAt(0);
      if (action === "end") return focusAt(items.length - 1);
      const targetIdx = step(fromIdx, action === "forward" ? 1 : -1);
      focusAt(targetIdx);
      const target = items[targetIdx];
      if (target && !target.disabled) onChange(target.value);
    },
    [items, onChange, focusAt, step],
  );

  const handleKeyDown = useCallback(
    (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
      const action = resolveKey(e.key);
      if (!action) return;
      e.preventDefault();
      moveFocus(action, index);
    },
    [resolveKey, moveFocus],
  );

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cn(
        rootVariants({ size, fullWidth }),
        disabled && "opacity-40 pointer-events-none",
        className,
      )}
      style={
        fullWidth ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } : undefined
      }
    >
      {items.map((opt, i) => {
        const checked = opt.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: role=radio on <button> lets the Segmented control host rich visual labels not supported by native radio inputs.
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            tabIndex={checked ? 0 : -1}
            aria-checked={checked}
            aria-disabled={opt.disabled || undefined}
            data-model={opt.dataModel}
            disabled={opt.disabled || disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            onKeyDown={handleKeyDown(i)}
            className={cn(itemVariants({ size }), fullWidth && "text-center", itemClassName)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
