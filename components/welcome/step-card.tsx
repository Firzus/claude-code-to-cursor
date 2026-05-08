import type { ReactNode } from "react";
import { cn } from "~/lib/cn";

interface StepCardProps {
  index: number;
  total: number;
  title: string;
  description: string;
  children?: ReactNode;
  state?: "pending" | "active" | "done";
}

export function StepCard({
  index,
  total,
  title,
  description,
  children,
  state = "pending",
}: StepCardProps) {
  return (
    <article
      data-hover-target="border"
      className={cn(
        "relative flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-(--shadow-soft-sm) md:p-7",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out",
        "hover-only:hover:-translate-y-px hover-only:hover:shadow-(--shadow-soft-md)",
        state === "active" && "ring-1 ring-primary/30 shadow-(--shadow-soft-md)",
        state === "done" && "border-success/30",
        state !== "active" && "hover-only:hover:border-primary/30",
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground tabular">
          Step {index} <span className="text-muted-foreground/40">/ {total}</span>
        </span>
        <StepBadge state={state} />
      </header>
      <div className="space-y-2">
        <h3 className="font-display text-2xl leading-tight tracking-tight">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children ? <div className="pt-2">{children}</div> : null}
    </article>
  );
}

function StepBadge({ state }: { state: "pending" | "active" | "done" }) {
  if (state === "done") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2 py-1 text-[10px] font-medium tracking-wide text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" /> Done
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium tracking-wide text-primary">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        Now
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[10px] font-medium tracking-wide text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> Up next
    </span>
  );
}
