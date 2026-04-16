import { cn } from "~/lib/utils";

interface StepIndicatorProps {
  steps: readonly { id: string; label: string }[];
  currentIndex: number;
}

interface StepItemProps {
  step: { id: string; label: string };
  index: number;
  done: boolean;
  active: boolean;
}

function StepItem({ step, index, done, active }: StepItemProps) {
  const indexColor = active ? "text-foreground" : done ? "text-accent" : "text-muted-foreground/60";

  const stateColor = done ? "text-accent" : "text-muted-foreground/40";
  const stateLabel = done ? "ok" : active ? "··" : "—";

  return (
    <li
      className={cn(
        "relative flex flex-1 min-w-[110px] flex-col gap-2 px-3 py-2.5",
        "border-t transition-colors duration-300",
        active && "border-foreground",
        done && "border-accent",
        !active && !done && "border-border",
      )}
    >
      <div className="flex items-baseline justify-between font-mono text-[10.5px] uppercase tracking-[0.2em]">
        <span className={cn("transition-colors", indexColor)}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className={cn("transition-colors text-[9px]", stateColor)}>{stateLabel}</span>
      </div>
      <span
        className={cn(
          "text-[11px] font-mono uppercase tracking-[0.14em] transition-colors",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {step.label}
      </span>
    </li>
  );
}

export function StepIndicator({ steps, currentIndex }: StepIndicatorProps) {
  return (
    <ol
      className="flex items-stretch gap-px overflow-x-auto m-0 p-0 list-none"
      style={{
        maskImage: "linear-gradient(to right, transparent, black 4%, black 96%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 4%, black 96%, transparent)",
      }}
      aria-label="Setup progress"
    >
      {steps.map((step, i) => (
        <StepItem
          key={step.id}
          step={step}
          index={i}
          done={i < currentIndex}
          active={i === currentIndex}
        />
      ))}
    </ol>
  );
}
