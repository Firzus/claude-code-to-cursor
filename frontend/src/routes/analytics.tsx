import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  useAnalyticsSummary,
  useAnalyticsRequests,
  useAnalyticsTimeline,
} from "~/hooks/use-analytics";
import { apiFetch } from "~/lib/api-client";
import { calculateCacheSavings } from "~/lib/pricing";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "~/lib/utils";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Tooltip } from "~/components/ui/tooltip";
import { Badge } from "~/components/ui/badge";
import { EmptyState } from "~/components/empty-state";
import { StatCard } from "~/components/analytics/stat-card";
import { Pagination } from "~/components/analytics/pagination";
import { AgoText } from "~/components/analytics/ago-text";
import { ConfirmDialog } from "~/components/analytics/confirm-dialog";
import {
  Trash2,
  RefreshCw,
  Activity,
  ArrowUpFromLine,
  Zap,
  Inbox,
  AlertCircle,
  TrendingDown,
  DollarSign,
  Database,
} from "lucide-react";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
});

const periods = [
  { value: "hour", label: "1H" },
  { value: "day", label: "24H" },
  { value: "week", label: "7D" },
  { value: "month", label: "30D" },
  { value: "all", label: "All" },
] as const;

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

const tokenBreakdownConfig = {
  cacheReadTokens: {
    label: "Cache Read",
    color: "var(--color-success)",
  },
  inputTokens: {
    label: "Fresh Input",
    color: "var(--color-chart-1)",
  },
  cacheCreationTokens: {
    label: "Cache Write",
    color: "var(--color-chart-3)",
  },
  outputTokens: {
    label: "Output",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig;

const cacheRateConfig = {
  cacheHitRate: {
    label: "Cache Hit Rate",
    color: "var(--color-chart-4)",
  },
} satisfies ChartConfig;

const PAGE_SIZE = 20;

function AnalyticsPage() {
  const [period, setPeriod] = useState("day");
  const [page, setPage] = useState(1);
  const summary = useAnalyticsSummary(period);
  const requests = useAnalyticsRequests(PAGE_SIZE, period, page);
  const timeline = useAnalyticsTimeline(period);
  const qc = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (summary.dataUpdatedAt) setLastUpdated(summary.dataUpdatedAt);
  }, [summary.dataUpdatedAt]);

  function handlePeriodChange(value: string) {
    setPeriod(value);
    setPage(1);
  }

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ["analytics"] });
  }

  function handleReset() {
    setConfirmOpen(false);
    setResetting(true);
    apiFetch("/analytics/reset", { method: "POST" })
      .then(() => qc.invalidateQueries({ queryKey: ["analytics"] }))
      .finally(() => setResetting(false));
  }

  const s = summary.data;

  const savings = s
    ? calculateCacheSavings(
        s.totalInputTokens,
        s.totalCacheReadTokens,
        s.totalCacheCreationTokens,
      )
    : null;

  const timelineWithRate = timeline.data?.buckets.map((b) => {
    const total =
      b.inputTokens + b.cacheReadTokens + (b.cacheCreationTokens ?? 0);
    return {
      ...b,
      cacheHitRate: total > 0 ? (b.cacheReadTokens / total) * 100 : 0,
    };
  });

  const avgCacheRate = s ? s.cacheHitRate * 100 : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium">Analytics</h1>
          <AgoText updatedAt={lastUpdated} />
        </div>
        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Time period"
            className="flex rounded-md border border-border text-[12px]"
          >
            {periods.map(({ value, label }) => (
              <button
                key={value}
                role="radio"
                aria-checked={period === value}
                onClick={() => handlePeriodChange(value)}
                className={cn(
                  "px-2.5 py-1 font-mono transition-colors cursor-pointer first:rounded-l-md last:rounded-r-md",
                  period === value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            aria-label="Refresh analytics data"
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={resetting}
            aria-label="Reset analytics data"
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset all analytics?"
        description="This will permanently delete all recorded requests and statistics. This action cannot be undone."
        onConfirm={handleReset}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Error state */}
      {summary.isError && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center justify-center gap-3 py-8">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-[13px] text-destructive">
              Failed to load analytics.
            </span>
            <button
              onClick={() => summary.refetch()}
              className="text-[12px] text-foreground underline underline-offset-2 cursor-pointer"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      {s && savings && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            icon={Activity}
            label="Requests"
            value={fmt(s.totalRequests)}
            sub={`${s.claudeCodeRequests} ok${s.errorRequests ? ` · ${s.errorRequests} err` : ""}`}
            accent="chart-1"
          />
          <StatCard
            icon={Zap}
            label="Cache Hit Rate"
            value={pct(s.cacheHitRate * 100)}
            sub={`${fmt(s.totalCacheReadTokens)} / ${fmt(savings.allInput)}`}
            accent="chart-4"
          />
          <StatCard
            icon={TrendingDown}
            label="Tokens Saved"
            value={fmt(s.totalCacheReadTokens)}
            sub={`of ${fmt(savings.allInput)} total input`}
            accent="success"
          />
          <StatCard
            icon={DollarSign}
            label="Est. Savings"
            value={pct(savings.savingsPercent)}
            sub={savings.allInput > 0 ? `~${fmt(savings.tokensSaved)} tokens equiv.` : "no data yet"}
            accent="success"
          />
          <StatCard
            icon={Database}
            label="Cache Written"
            value={fmt(s.totalCacheCreationTokens)}
            sub="125% cost multiplier"
            accent="chart-3"
          />
          <StatCard
            icon={ArrowUpFromLine}
            label="Output"
            value={fmt(s.totalOutputTokens)}
            sub={s.totalRequests > 0 ? `avg ${fmt(Math.round(s.totalOutputTokens / s.totalRequests))} / req` : "—"}
            accent="chart-2"
          />
        </div>
      )}

      {summary.isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts */}
      {timelineWithRate && timelineWithRate.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] text-muted-foreground mb-3 font-medium">
                Token breakdown over time
              </div>
              <ChartContainer
                config={tokenBreakdownConfig}
                className="aspect-auto h-[220px] w-full"
              >
                <AreaChart
                  accessibilityLayer
                  data={timelineWithRate}
                  margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillCacheRead" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillFreshInput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillCacheWrite" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="timestamp" tickLine={false} axisLine={false} tickMargin={8} minTickGap={40}
                    tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)"
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      if (period === "hour" || period === "day")
                        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      return d.toLocaleDateString([], { month: "short", day: "numeric" });
                    }}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} width={50} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" tickFormatter={(v) => fmt(v)} />
                  <RechartsTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(v) => {
                          const d = new Date(Number(v));
                          return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                        }}
                        formatter={(value) => fmt(value)}
                      />
                    }
                  />
                  <Area type="monotone" dataKey="cacheReadTokens" stackId="1" stroke="var(--color-success)" strokeWidth={1.5} fill="url(#fillCacheRead)" dot={false} />
                  <Area type="monotone" dataKey="inputTokens" stackId="1" stroke="var(--color-chart-1)" strokeWidth={1.5} fill="url(#fillFreshInput)" dot={false} />
                  <Area type="monotone" dataKey="cacheCreationTokens" stackId="1" stroke="var(--color-chart-3)" strokeWidth={1.5} fill="url(#fillCacheWrite)" dot={false} />
                  <Area type="monotone" dataKey="outputTokens" stroke="var(--color-chart-2)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" dot={false} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] text-muted-foreground mb-3 font-medium">
                Cache hit rate over time
              </div>
              <ChartContainer config={cacheRateConfig} className="aspect-auto h-[220px] w-full">
                <AreaChart accessibilityLayer data={timelineWithRate} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillCacheRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-chart-4)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="timestamp" tickLine={false} axisLine={false} tickMargin={8} minTickGap={40}
                    tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)"
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      if (period === "hour" || period === "day")
                        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      return d.toLocaleDateString([], { month: "short", day: "numeric" });
                    }}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <RechartsTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(v) => {
                          const d = new Date(Number(v));
                          return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                        }}
                        formatter={(value) => `${Number(value).toFixed(1)}%`}
                      />
                    }
                  />
                  {avgCacheRate > 0 && (
                    <ReferenceLine y={avgCacheRate} stroke="var(--color-chart-4)" strokeDasharray="6 4" strokeOpacity={0.5} />
                  )}
                  <Area type="monotone" dataKey="cacheHitRate" stroke="var(--color-chart-4)" strokeWidth={1.5} fill="url(#fillCacheRate)" dot={false} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {timeline.isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-3 w-32 mb-3" />
                <Skeleton className="h-[220px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      <Card>
        <div className="px-4 py-3 text-[13px] font-medium border-b border-border">
          Recent Requests
        </div>
        {requests.isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : requests.isError ? (
          <div className="px-4 py-10 text-center">
            <span className="text-[13px] text-destructive">
              Failed to load requests.
            </span>
            <button
              onClick={() => requests.refetch()}
              className="ml-2 text-[12px] text-foreground underline underline-offset-2 cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : !requests.data?.requests.length ? (
          <EmptyState
            icon={Inbox}
            title="No requests yet"
            description="Send your first request through the proxy to see it appear here."
            className="py-12"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]" aria-label="Recent API requests">
                <caption className="sr-only">
                  List of recent API requests with timing, model, tokens, cache efficiency, and status
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                    <th className="px-3 sm:px-4 py-2 font-normal whitespace-nowrap hidden sm:table-cell">Time</th>
                    <th className="px-3 sm:px-4 py-2 font-normal">Model</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap">Fresh In</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap hidden sm:table-cell">Cache Read</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap hidden md:table-cell">Cache Write</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap">Out</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap hidden sm:table-cell">Cache %</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap hidden md:table-cell">Latency</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.data.requests.map((r) => {
                    const cacheRead = r.cacheReadTokens ?? 0;
                    const cacheWrite = r.cacheCreationTokens ?? 0;
                    const rowAllInput = r.inputTokens + cacheRead + cacheWrite;
                    const rowCacheRate = rowAllInput > 0 ? (cacheRead / rowAllInput) * 100 : 0;

                    return (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-card transition-colors">
                        <td className="px-3 sm:px-4 py-2.5 font-mono text-muted-foreground tabular whitespace-nowrap hidden sm:table-cell">
                          {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 font-mono truncate">
                          {r.model.replace("claude-", "")}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 font-mono text-right tabular whitespace-nowrap">
                          {fmt(r.inputTokens)}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 font-mono text-right tabular whitespace-nowrap hidden sm:table-cell" style={{ color: cacheRead > 0 ? "var(--color-success)" : undefined }}>
                          {cacheRead > 0 ? fmt(cacheRead) : "\u2014"}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 font-mono text-right tabular text-muted-foreground whitespace-nowrap hidden md:table-cell">
                          {cacheWrite > 0 ? fmt(cacheWrite) : "\u2014"}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 font-mono text-right tabular whitespace-nowrap">
                          {fmt(r.outputTokens)}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 text-right whitespace-nowrap hidden sm:table-cell">
                          {rowCacheRate > 0 ? (
                            <Badge
                              variant={rowCacheRate >= 80 ? "success" : rowCacheRate >= 40 ? "warning" : "secondary"}
                              className="text-[11px] px-1.5 py-0 font-mono"
                            >
                              {pct(rowCacheRate)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">{"\u2014"}</span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 font-mono text-right text-muted-foreground tabular whitespace-nowrap hidden md:table-cell">
                          {r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "\u2014"}
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 text-right">
                          {r.source === "error" && r.error ? (
                            <Tooltip
                              content={
                                <span className="max-w-[200px] block truncate">
                                  {r.error}
                                </span>
                              }
                            >
                              <span className="inline-block h-2 w-2 rounded-full bg-destructive cursor-help" aria-label="Error" />
                              <span className="sr-only">Error: {r.error}</span>
                            </Tooltip>
                          ) : (
                            <>
                              <span className="inline-block h-2 w-2 rounded-full bg-success" />
                              <span className="sr-only">Success</span>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={requests.data.total}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
