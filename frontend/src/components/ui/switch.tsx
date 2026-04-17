import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "~/lib/utils";

type BaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange">;

interface SwitchProps extends BaseProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Render the ASCII `[on]` / `[off]` indicator used on Settings. Default true. */
  ascii?: boolean;
  /** Visual size. */
  size?: "sm" | "default";
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { checked, onCheckedChange, ascii = true, size = "default", className, disabled, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        data-state={checked ? "checked" : "unchecked"}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          "group inline-flex items-center gap-2 rounded-md border font-mono",
          "transition-[background-color,border-color,color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-quart)]",
          "cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
          size === "sm" ? "h-6 px-2 text-[10px]" : "h-7 px-2.5 text-[11px]",
          checked
            ? "border-accent/50 bg-accent/10 text-accent"
            : "border-border/70 bg-card/30 text-muted-foreground hover:text-foreground hover:border-border",
          className,
        )}
        {...props}
      >
        {ascii && (
          <>
            <span className="tracking-[0.2em] uppercase tabular w-[18px] text-center">
              {checked ? "on" : "off"}
            </span>
            <span aria-hidden="true" className="text-border">
              ─
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors duration-[var(--duration-base)]",
                checked
                  ? "bg-accent shadow-[0_0_6px_var(--color-accent)]"
                  : "bg-muted-foreground/40",
              )}
            />
          </>
        )}
      </button>
    );
  },
);
Switch.displayName = "Switch";
