import { cn } from "~/lib/utils";

interface ToggleAsciiProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}

export function ToggleAscii({ checked, onChange, ariaLabel }: ToggleAsciiProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "group inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors cursor-pointer",
        checked
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border/70 bg-card/30 text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="tracking-[0.2em] uppercase tabular w-[18px] text-center">
        {checked ? "on" : "off"}
      </span>
      <span aria-hidden="true" className="text-border">
        ─
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-colors",
          checked ? "bg-accent shadow-[0_0_6px_var(--color-accent)]" : "bg-muted-foreground/40",
        )}
      />
    </button>
  );
}
