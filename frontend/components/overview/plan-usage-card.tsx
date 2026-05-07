"use client";

import { AlertCircle, Clock } from "lucide-react";
import { RelativeTime } from "~/components/layout/relative-time";
import { PlanUsageArc } from "~/components/overview/plan-usage-arc";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { usePlanUsage } from "~/hooks/use-plan-usage";
import { cn } from "~/lib/cn";
import { modelLabel } from "~/lib/format";
import { type PlanUsage, planLabels } from "~/lib/schemas";

interface PlanUsageCardProps {
  initial?: PlanUsage;
}

export function PlanUsageCard({ initial }: PlanUsageCardProps) {
  const { data, error, isLoading } = usePlanUsage(initial);

  return (
    <Card className="border-none bg-card shadow-(--shadow-soft-md)">
      <CardContent className="px-6 md:px-10">
        <div className="flex flex-col gap-2 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Plan usage</span>
            <h2 className="font-display mt-2 text-3xl tracking-tight">
              {data ? planLabels[data.plan] : "Plan"}
              <span className="text-muted-foreground"> · today</span>
            </h2>
          </div>
          {data ? (
            <SourcePill source={data.source} capturedAt={data.capturedAt} />
          ) : isLoading ? (
            <Skeleton className="h-6 w-32" />
          ) : null}
        </div>

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
      </CardContent>
    </Card>
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
      <span className="text-xs text-muted-foreground">
        Resets <RelativeTime timestamp={resetAt} />
      </span>
      {representative ? (
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-primary">
          Representative · this is the binding window
        </span>
      ) : null}
    </div>
  );
}

function SourcePill({
  source,
  capturedAt,
}: {
  source: PlanUsage["source"];
  capturedAt: number | null;
}) {
  const map = {
    anthropic: { tone: "bg-success/15 text-success", label: "Live · from Anthropic" },
    estimated: { tone: "bg-warning/15 text-warning", label: "Estimated · local count" },
    none: { tone: "bg-muted text-muted-foreground", label: "Awaiting first request" },
  } as const;
  const cfg = map[source];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium tabular",
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

export function ModelHint({ value }: { value: string }) {
  return <span className="font-mono text-sm text-muted-foreground">{modelLabel(value)}</span>;
}
