import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  Calendar,
  DollarSign,
  Download,
  Inbox,
  RefreshCw,
  Trash2,
  TrendingDown,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { AgoText } from "~/components/analytics/ago-text";
import { ConfirmDialog } from "~/components/analytics/confirm-dialog";
import { ExpandableRow } from "~/components/analytics/expandable-row";
import { Pagination } from "~/components/analytics/pagination";
import { StatCard } from "~/components/analytics/stat-card";
import { EmptyState } from "~/components/empty-state";
import { Card, CardContent } from "~/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltipContent } from "~/components/ui/chart";
import { Skeleton } from "~/components/ui/skeleton";
import {
  useAnalyticsRequests,
  useAnalyticsSummary,
  useAnalyticsTimeline,
} from "~/hooks/use-analytics";
import { useBudgetDay } from "~/hooks/use-budget";
import { apiFetch } from "~/lib/api-client";
import { CACHE_READ_COST_RATIO, calculateCacheSavings } from "~/lib/pricing";
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";
import type { RequestRecord } from "~/schemas/api-responses";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
});

const periods = [
  { value: "5hour", label: "5H" },
  { value: "day", label: "24H" },
  { value: "week", label: "7J" },
  { value: "month", label: "30J" },
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

function formatCost(r: RequestRecord): string {
  if (r.source === "error" && !r.estimatedUsd) return "\u2014";
  const usd = r.estimatedUsd ?? 0;
  if (usd < 0.005) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function exportCsv(requests: RequestRecord[]) {
  const headers = [
    "Date",
    "Model",
    "Source",
    "Input Tokens",
    "Output Tokens",
    "Cache Read",
    "Cache Write",
    "Thinking",
    "Latency (ms)",
    "Estimated USD",
    "Route",
    "Effort",
    "Error",
  ];
  const rows = requests.map((r) => [
    new Date(r.timestamp).toISOString(),
    r.model,
    r.source,
    r.inputTokens,
    r.outputTokens,
    r.cacheReadTokens ?? 0,
    r.cacheCreationTokens ?? 0,
    r.thinkingTokens ?? 0,
    r.latencyMs ?? "",
    r.estimatedUsd?.toFixed(4) ?? "",
    r.route ?? "",
    r.appliedThinkingEffort ?? "",
    r.error ?? "",
  ]);

  const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

const PAGE_SIZE = 20;

function AnalyticsPage() {
  const [period, setPeriod] = useState("day");
  const [page, setPage] = useState(1);
  const summary = useAnalyticsSummary(period);
  const requests = useAnalyticsRequests(PAGE_SIZE, period, page);
  const timeline = useAnalyticsTimeline(period);
  const budget = useBudgetDay();
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
    qc.invalidateQueries({ queryKey: queryKeys.budget });
  }

  function handleReset() {
    setConfirmOpen(false);
    setResetting(true);
    apiFetch("/analytics/reset", { method: "POST" })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["analytics"] });
        qc.invalidateQueries({ queryKey: queryKeys.budget });
      })
      .catch(() => {})
      .finally(() => setResetting(false));
  }

  const s = summary.data;

  const savings = s
    ? calculateCacheSavings(s.totalInputTokens, s.totalCacheReadTokens, s.totalCacheCreationTokens)
    : null;

  const timelineData = timeline.data?.buckets;

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
                type="button"
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
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh analytics data"
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={resetting}
            aria-label="Reset analytics data"
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {requests.data?.requests.length ? (
            <button
              type="button"
              onClick={() => requests.data && exportCsv(requests.data.requests)}
              aria-label="Export CSV"
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] font-mono text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              <Download className="h-3 w-3" />
              Export CSV
            </button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset all analytics?"
        description="This will permanently delete all recorded requests and statistics. This action cannot be undone."
        onConfirm={handleReset}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Budget — today (UTC) */}
      {budget.isLoading && (
        <Card>
          <CardContent className="p-5">
            <Skeleton className="h-4 w-40 mb-4" />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {budget.data && (
        <Card className="border-border/80">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] text-muted-foreground font-medium">
                Today (UTC) &mdash; {new Date(budget.data.periodStart).toISOString().slice(0, 10)}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <BudgetMetric
                label="Estimated cost"
                value={`$${budget.data.estimatedUsd.toFixed(2)}`}
                accent="chart-3"
                primary
              />
              <BudgetMetric
                label="Tokens in"
                value={fmt(
                  budget.data.inputTokens +
                    budget.data.cacheReadTokens +
                    budget.data.cacheCreationTokens,
                )}
              />
              <BudgetMetric label="Tokens out" value={fmt(budget.data.outputTokens)} />
              <BudgetMetric label="Thinking" value={fmt(budget.data.thinkingTokens)} />
              <BudgetMetric
                label="Cache saved"
                value={`$${(
                  (budget.data.cacheReadTokens * (1 - CACHE_READ_COST_RATIO) * 15) / 1_000_000
                ).toFixed(2)}`}
                accent="success"
              />
            </div>
          </CardContent>
        </Card>
      )}
      {budget.isError && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-2 py-3 text-[12px] text-destructive">
            <AlertCircle className="h-4 w-4" />
            Failed to load daily budget.
            <button
              type="button"
              onClick={() => budget.refetch()}
              className="underline underline-offset-2 cursor-pointer"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {summary.isError && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center justify-center gap-3 py-8">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-[13px] text-destructive">Failed to load analytics.</span>
            <button
              type="button"
              onClick={() => summary.refetch()}
              className="text-[12px] text-foreground underline underline-offset-2 cursor-pointer"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {/* Stat cards — 4 essentials */}
      {s && savings && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={Activity}
            label="Requests"
            value={fmt(s.totalRequests)}
            sub={`${s.claudeCodeRequests} ok${s.errorRequests ? ` \u00b7 ${s.errorRequests} err` : ""}`}
            accent="chart-1"
          />
          <StatCard
            icon={DollarSign}
            label="Est. cost saved"
            value={`$${s.cacheSavingsUsdEstimate.toFixed(2)}`}
            sub={
              savings.savingsPercent > 0
                ? `${pct(savings.savingsPercent)} less vs no cache`
                : "no data yet"
            }
            accent="success"
          />
          <StatCard
            icon={Zap}
            label="Cache hit rate"
            value={pct(s.cacheHitRate * 100)}
            sub={`${fmt(s.totalCacheReadTokens)} of ${fmt(savings.allInput)} input`}
            accent="chart-4"
          />
          <StatCard
            icon={TrendingDown}
            label="Avg output"
            value={
              s.totalRequests > 0
                ? fmt(Math.round(s.totalOutputTokens / s.totalRequests))
                : "\u2014"
            }
            sub={`${fmt(s.totalOutputTokens)} total`}
            accent="chart-2"
          />
        </div>
      )}

      {summary.isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
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

      {/* Chart — Token usage over time */}
      {timelineData && timelineData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-[12px] text-muted-foreground mb-3 font-medium">
              Token usage over time
            </div>
            <ChartContainer config={tokenBreakdownConfig} className="aspect-auto h-[200px] w-full">
              <AreaChart
                accessibilityLayer
                data={timelineData}
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
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="timestamp"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={40}
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    if (period === "5hour" || period === "day")
                      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    return d.toLocaleDateString([], { month: "short", day: "numeric" });
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={50}
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v: number) => fmt(v)}
                />
                <RechartsTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v: string | number) => {
                        const d = new Date(Number(v));
                        return d.toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                      }}
                      formatter={(value: number) => fmt(value)}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="cacheReadTokens"
                  stackId="1"
                  stroke="var(--color-success)"
                  strokeWidth={1.5}
                  fill="url(#fillCacheRead)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="inputTokens"
                  stackId="1"
                  stroke="var(--color-chart-1)"
                  strokeWidth={1.5}
                  fill="url(#fillFreshInput)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="cacheCreationTokens"
                  stackId="1"
                  stroke="var(--color-chart-3)"
                  strokeWidth={1.5}
                  fill="url(#fillCacheWrite)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="outputTokens"
                  stroke="var(--color-chart-2)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="none"
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {timeline.isLoading && (
        <Card>
          <CardContent className="p-4">
            <Skeleton className="h-3 w-32 mb-3" />
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      )}

      {/* Requests table */}
      <Card>
        <div className="px-4 py-3 text-[13px] font-medium border-b border-border">
          Request History
        </div>
        {requests.isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : requests.isError ? (
          <div className="px-4 py-10 text-center">
            <span className="text-[13px] text-destructive">Failed to load requests.</span>
            <button
              type="button"
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
              <table className="w-full text-[13px]" aria-label="Request history">
                <caption className="sr-only">API request history with expandable details</caption>
                <thead>
                  <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                    <th className="px-4 py-2 font-normal whitespace-nowrap">Date</th>
                    <th className="px-4 py-2 font-normal whitespace-nowrap hidden sm:table-cell">
                      Type
                    </th>
                    <th className="px-4 py-2 font-normal">Model</th>
                    <th className="px-4 py-2 font-normal text-right whitespace-nowrap">Tokens</th>
                    <th className="px-4 py-2 font-normal text-right whitespace-nowrap">Cost</th>
                    <th className="px-4 py-2 font-normal text-right whitespace-nowrap w-8">
                      <span className="sr-only">Status</span>
                    </th>
                    <th className="px-4 py-2 font-normal w-8">
                      <span className="sr-only">Expand</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.data.requests.map((r) => (
                    <ExpandableRow
                      key={r.id}
                      record={r}
                      formatTokens={fmt}
                      formatCost={formatCost}
                      formatDate={formatDate}
                    />
                  ))}
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

function BudgetMetric({
  label,
  value,
  accent,
  primary,
}: {
  label: string;
  value: string;
  accent?: string;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      <span
        className={cn("font-mono tabular font-semibold", primary ? "text-2xl" : "text-lg")}
        style={accent ? { color: `var(--color-${accent})` } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
