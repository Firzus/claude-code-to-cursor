"use client";

import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { useAnalyticsSummary } from "~/hooks/use-analytics-summary";
import { formatCompactTokens, formatPercent, formatUsd } from "~/lib/format";
import type { AnalyticsSummary, Period } from "~/lib/schemas";

interface UsageSummaryProps {
  period: Period;
  initial?: AnalyticsSummary;
}

export function UsageSummary({ period, initial }: UsageSummaryProps) {
  const { data, isLoading } = useAnalyticsSummary(period, initial);

  return (
    <Card className="border-none shadow-(--shadow-soft-md)">
      <CardContent className="grid grid-cols-2 gap-6 px-6 md:grid-cols-5 md:px-8">
        <Stat label="Requests" value={data ? data.totalRequests.toString() : null} />
        <Stat
          label="Errors"
          value={data ? data.errorRequests.toString() : null}
          hint={
            data && data.totalRequests > 0
              ? `${formatPercent((data.errorRequests / data.totalRequests) * 100, 1)} error rate`
              : "—"
          }
        />
        <Stat
          label="Tokens in"
          value={
            data
              ? formatCompactTokens(
                  data.totalInputTokens + data.totalCacheReadTokens + data.totalCacheCreationTokens,
                )
              : null
          }
        />
        <Stat
          label="Tokens out"
          value={data ? formatCompactTokens(data.totalOutputTokens) : null}
        />
        <Stat
          label="Cache savings"
          value={data ? formatUsd(data.cacheSavingsUsdEstimate) : null}
          hint={data ? `${formatPercent(data.cacheHitRate)} hit rate` : "—"}
          tone="success"
        />
        {isLoading && !data
          ? Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton placeholders
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-24" />
              </div>
            ))
          : null}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | null;
  hint?: string;
  tone?: "success";
}) {
  return (
    <div className="space-y-1">
      <span className="eyebrow">{label}</span>
      <p
        className={`font-display text-3xl tracking-tight tabular ${
          tone === "success" ? "text-success" : ""
        }`}
      >
        {value ?? "—"}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
