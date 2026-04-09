import { Check } from "lucide-react";
import { cn } from "~/lib/utils";

interface StepIndicatorProps {
  steps: readonly { id: string; label: string }[];
  currentIndex: number;
}

export function StepIndicator({ steps, currentIndex }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-1">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.id} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={cn(
                  "h-px w-8 transition-colors duration-500",
                  done ? "bg-accent" : "bg-border",
                )}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-mono transition-all duration-300",
                  done && "bg-accent text-background",
                  active &&
                    "border-2 border-accent text-accent shadow-[0_0_12px_-2px_var(--color-accent)]",
                  !done &&
                    !active &&
                    "border border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={cn(
                  "hidden text-[12px] sm:inline transition-colors",
                  active
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
