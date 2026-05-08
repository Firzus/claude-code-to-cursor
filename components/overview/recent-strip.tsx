"use client";

import { ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";
import { RelativeTime } from "~/components/layout/relative-time";
import { FadeStagger } from "~/components/motion/fade-stagger";
import { Skeleton } from "~/components/ui/skeleton";
import { useAnalyticsRequests } from "~/hooks/use-analytics-requests";
import { cn } from "~/lib/cn";
import { formatCompactTokens, modelLabel } from "~/lib/format";
import type { AnalyticsRequests } from "~/lib/schemas";

export function RecentStrip({ initial }: { initial?: AnalyticsRequests }) {
  const { data, isLoading } = useAnalyticsRequests("day", 1, 8, initial);

  return (
    <section aria-label="Recent activity" className="rounded-xl border bg-card">
      <header className="flex items-baseline justify-between border-b px-6 py-5 md:px-8">
        <div className="space-y-2">
          <span className="eyebrow">Recent activity</span>
          <h3 className="font-display text-2xl leading-tight tracking-tight">Last 8 requests</h3>
        </div>
        <Link
          href="/usage"
          className="group inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors duration-150 hover-only:hover:text-foreground"
        >
          See all
          <ChevronRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </header>

      {isLoading && !data ? (
        <div className="space-y-2 p-6">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>
      ) : !data?.requests.length ? (
        <EmptyState />
      ) : (
        <FadeStagger className="divide-y divide-border" stagger={0.04} y={4}>
          {data.requests.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_auto] items-center gap-4 px-6 py-3 text-sm transition-colors duration-150 hover-only:hover:bg-accent/40 md:px-8"
            >
              <div className="flex items-center gap-3 truncate">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    r.source === "error" ? "bg-destructive" : "bg-success",
                  )}
                />
                <span className="truncate font-medium">{modelLabel(r.model)}</span>
                {r.appliedThinkingEffort ? (
                  <span className="hidden rounded-full border border-primary/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary sm:inline-flex">
                    think · {r.appliedThinkingEffort}
                  </span>
                ) : null}
                {r.route ? (
                  <span className="hidden rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline-flex">
                    {r.route}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-4 text-muted-foreground tabular">
                <span className="hidden font-mono text-xs sm:inline">
                  in {formatCompactTokens(r.inputTokens)} · out{" "}
                  {formatCompactTokens(r.outputTokens)}
                </span>
                <span className="font-mono text-xs">
                  <RelativeTime timestamp={r.timestamp} />
                </span>
              </div>
            </div>
          ))}
        </FadeStagger>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="flex size-9 items-center justify-center rounded-full border bg-background text-muted-foreground">
        <Inbox className="size-3.5" />
      </span>
      <p className="font-display text-xl tracking-tight">No requests yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Once a client hits your proxy, the latest calls will appear here in real time.
      </p>
    </div>
  );
}
