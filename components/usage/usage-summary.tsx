"use client";

import { NumberTicker } from "~/components/motion/number-ticker";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { useAnalyticsSummary } from "~/hooks/use-analytics-summary";
import { cn } from "~/lib/cn";
import { compactNumber, formatPercent } from "~/lib/format";
import type { AnalyticsSummary, Period } from "~/lib/schemas";

interface UsageSummaryProps {
  period: Period;
  initial?: AnalyticsSummary;
}

export function UsageSummary({ period, initial }: UsageSummaryProps) {
  const { data, isLoading } = useAnalyticsSummary(period, initial);

  const totalIn = data
    ? data.totalInputTokens + data.totalCacheReadTokens + data.totalCacheCreationTokens
    : 0;
  const totalOut = data?.totalOutputTokens ?? 0;
  const inFmt = compactNumber(totalIn);
  const outFmt = compactNumber(totalOut);

  return (
    <Card className="border-none shadow-(--shadow-soft-md)">
      <CardContent className="grid grid-cols-2 gap-6 px-5 py-6 sm:gap-7 md:grid-cols-5 md:px-8 md:py-7">
        <Stat
          label="Requests"
          numeric={data ? <NumberTicker value={data.totalRequests} /> : null}
        />
        <Stat
          label="Errors"
          numeric={data ? <NumberTicker value={data.errorRequests} /> : null}
          hint={
            data && data.totalRequests > 0
              ? `${formatPercent((data.errorRequests / data.totalRequests) * 100, 1)} error rate`
              : "—"
          }
        />
        <Stat
          label="Tokens in"
          numeric={
            data ? (
              <NumberTicker value={inFmt.value} decimals={inFmt.decimals} suffix={inFmt.suffix} />
            ) : null
          }
        />
        <Stat
          label="Tokens out"
          numeric={
            data ? (
              <NumberTicker
                value={outFmt.value}
                decimals={outFmt.decimals}
                suffix={outFmt.suffix}
              />
            ) : null
          }
        />
        <Stat
          label="Cache savings"
          numeric={
            data ? (
              <NumberTicker value={data.cacheSavingsUsdEstimate} prefix="$" decimals={2} />
            ) : null
          }
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
  numeric,
  hint,
  tone,
}: {
  label: string;
  numeric: React.ReactNode;
  hint?: string;
  tone?: "success";
}) {
  return (
    <div className="space-y-1">
      <span className="eyebrow">{label}</span>
      <p
        className={cn(
          "font-display text-3xl tracking-tight tabular md:text-[2rem]",
          tone === "success" && "text-success",
        )}
      >
        {numeric ?? "—"}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
