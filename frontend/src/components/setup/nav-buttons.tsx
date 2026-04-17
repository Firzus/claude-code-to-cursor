import { Button } from "~/components/ui/button";

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
    <div className="flex items-center justify-between gap-3 font-mono text-[12px]">
      {onPrev ? (
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onPrev}
          leading={
            <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
              ←
            </span>
          }
        >
          back
        </Button>
      ) : (
        <div />
      )}
      {onNext && (
        <Button
          type="button"
          variant="terminal"
          size="md"
          onClick={onNext}
          disabled={nextDisabled}
          trailing={
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          }
        >
          {nextLabel}
        </Button>
      )}
    </div>
  );
}
