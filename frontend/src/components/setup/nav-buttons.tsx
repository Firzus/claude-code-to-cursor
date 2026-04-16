import { cn } from "~/lib/utils";

interface NavButtonsProps {
  onPrev?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}

export function NavButtons({
  onPrev,
  onNext,
  nextLabel = "continue",
  nextDisabled = false,
}: NavButtonsProps) {
  return (
    <div className="flex items-center justify-between font-mono text-[12px]">
      {onPrev ? (
        <button
          type="button"
          onClick={onPrev}
          className="group inline-flex h-9 items-center gap-2 rounded-md border border-border/60 bg-card/30 px-4 text-muted-foreground transition-colors hover:border-border hover:bg-card/60 hover:text-foreground cursor-pointer"
        >
          <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
            ←
          </span>
          back
        </button>
      ) : (
        <div />
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className={cn(
            "group inline-flex h-9 items-center gap-2 rounded-md border border-foreground/80 bg-foreground px-5 font-medium text-background transition-all",
            "hover:bg-foreground/95 hover:shadow-[0_0_0_4px_oklch(from_var(--color-foreground)_l_c_h/0.12)]",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none",
            !nextDisabled && "cursor-pointer",
          )}
        >
          {nextLabel}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </button>
      )}
    </div>
  );
}
