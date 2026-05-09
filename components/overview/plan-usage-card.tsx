"use client";

import { AlertCircle, Clock } from "lucide-react";
import { RelativeTime } from "~/components/layout/relative-time";
import { PlanUsageArc } from "~/components/overview/plan-usage-arc";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Skeleton } from "~/components/ui/skeleton";
import { usePlanUsage } from "~/hooks/use-plan-usage";
import { cn } from "~/lib/cn";
import { type PlanUsage, planLabels } from "~/lib/schemas";

interface PlanUsageCardProps {
  initial?: PlanUsage;
}

export function PlanUsageCard({ initial }: PlanUsageCardProps) {
  const { data, error, isLoading } = usePlanUsage(initial);

  return (
    <section
      aria-label="Plan usage"
      className="rounded-xl border bg-card px-6 py-7 md:px-10 md:py-9"
    >
      <header className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <span className="eyebrow">Plan usage</span>
          <h2 className="font-display text-3xl leading-tight tracking-tight">
            {data ? planLabels[data.plan] : "Plan"}
            <span className="font-sans text-3xl font-medium text-muted-foreground"> · today</span>
          </h2>
        </div>
        {data ? (
          <SourcePill source={data.source} capturedAt={data.capturedAt} />
        ) : isLoading ? (
          <Skeleton className="h-6 w-32" />
        ) : null}
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Plan usage is unavailable</AlertTitle>
          <AlertDescription>
            We couldn’t fetch the current limits — the proxy will retry every 30 seconds.
          </AlertDescription>
        </Alert>
      ) : null}

      {!error && data ? (
        <div className="grid gap-10 md:grid-cols-2">
          <ArcBlock
            label="5-hour window"
            value={data.usage.fiveHour.percent}
            representative={data.representativeClaim === "five_hour"}
            resetAt={data.usage.fiveHour.resetAt}
          />
          <ArcBlock
            label="7-day window"
            value={data.usage.weekly.percent}
            representative={data.representativeClaim === "seven_day"}
            resetAt={data.usage.weekly.resetAt}
          />
        </div>
      ) : null}

      {!error && !data && isLoading ? (
        <div className="grid gap-10 md:grid-cols-2">
          <Skeleton className="mx-auto h-40 w-72" />
          <Skeleton className="mx-auto h-40 w-72" />
        </div>
      ) : null}
    </section>
  );
}

function ArcBlock({
  label,
  value,
  representative,
  resetAt,
}: {
  label: string;
  value: number;
  representative: boolean;
  resetAt: number;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <PlanUsageArc value={value} label={label} />
      <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <span className="text-xs text-muted-foreground/80">
        Resets <RelativeTime timestamp={resetAt} />
      </span>
      {representative ? (
        <span className="rounded-full border border-primary/30 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-primary">
          Representative
        </span>
      ) : null}
    </div>
  );
}

const SOURCE_PILL = {
  anthropic: { tone: "border-success/40 text-success", label: "Live · from Anthropic" },
  estimated: { tone: "border-warning/40 text-warning", label: "Estimated · local count" },
  none: { tone: "border-border text-muted-foreground", label: "Awaiting first request" },
} as const;

function SourcePill({
  source,
  capturedAt,
}: {
  source: PlanUsage["source"];
  capturedAt: number | null;
}) {
  const cfg = SOURCE_PILL[source];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium tabular",
        cfg.tone,
      )}
    >
      <Clock className="size-3" aria-hidden="true" />
      {cfg.label}
      {capturedAt ? (
        <span className="text-muted-foreground/80">
          · <RelativeTime timestamp={capturedAt} />
        </span>
      ) : null}
    </span>
  );
}
