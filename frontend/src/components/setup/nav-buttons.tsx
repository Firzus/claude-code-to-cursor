import { ArrowLeft, ArrowRight } from "lucide-react";

interface NavButtonsProps {
  onPrev?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}

export function NavButtons({
  onPrev,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
}: NavButtonsProps) {
  return (
    <div className="flex items-center justify-between">
      {onPrev ? (
        <button
          onClick={onPrev}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-4 text-[13px] text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/20 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      ) : (
        <div />
      )}
      {onNext && (
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="group inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-5 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {nextLabel}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}
