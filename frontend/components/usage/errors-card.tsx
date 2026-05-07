"use client";

import { AlertTriangle } from "lucide-react";
import { RelativeTime } from "~/components/layout/relative-time";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { useAnalyticsErrors } from "~/hooks/use-analytics-errors";
import { modelLabel } from "~/lib/format";
import type { AnalyticsErrors, Period } from "~/lib/schemas";

export function ErrorsCard({ period, initial }: { period: Period; initial?: AnalyticsErrors }) {
  const { data, isLoading } = useAnalyticsErrors(period, 5, initial);

  return (
    <Card className="border-none shadow-(--shadow-soft-md)">
      <CardContent className="px-6 md:px-8">
        <header className="mb-4 flex items-baseline justify-between">
          <div>
            <span className="eyebrow">Recent errors</span>
            <h3 className="font-display mt-2 text-2xl tracking-tight">
              {data?.total ?? 0} {(data?.total ?? 0) === 1 ? "incident" : "incidents"}
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {data ? `${data.totalAllTime} all-time` : ""}
          </span>
        </header>

        {isLoading && !data ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : !data?.errors.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            All clear. No errors recorded in this window.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.errors.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex size-7 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-3.5" />
                </span>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{modelLabel(e.model)}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      <RelativeTime timestamp={e.timestamp} />
                    </span>
                  </div>
                  <p className="line-clamp-2 font-mono text-xs text-destructive">
                    {e.error ?? "Unknown error"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
