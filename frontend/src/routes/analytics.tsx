import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  useAnalyticsSummary,
  useAnalyticsRequests,
  useAnalyticsTimeline,
} from "~/hooks/use-analytics";
import { apiFetch } from "~/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "~/lib/utils";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Tooltip } from "~/components/ui/tooltip";
import { EmptyState } from "~/components/empty-state";
import {
  Trash2,
  RefreshCw,
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Zap,
  Inbox,
  AlertCircle,
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

const chartConfig = {
  inputTokens: {
    label: "Input",
    color: "var(--color-chart-1)",
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
  const qc = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [agoText, setAgoText] = useState("just now");

  useEffect(() => {
    if (summary.dataUpdatedAt) setLastUpdated(summary.dataUpdatedAt);
  }, [summary.dataUpdatedAt]);

  useEffect(() => {
    const timer = setInterval(() => {
      const secs = Math.round((Date.now() - lastUpdated) / 1000);
      if (secs < 5) setAgoText("just now");
      else if (secs < 60) setAgoText(`${secs}s ago`);
      else setAgoText(`${Math.floor(secs / 60)}m ago`);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  function handlePeriodChange(value: string) {
    setPeriod(value);
    setPage(1);
  }

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ["analytics"] });
  }

  const s = summary.data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium">Analytics</h1>
          <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-success animate-pulse inline-block" />
            {agoText}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Period tabs */}
          <div className="flex rounded-md border border-border text-[12px]">
            {periods.map(({ value, label }) => (
              <button
                key={value}
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
            onClick={() => {
              if (!confirm("Reset all analytics?")) return;
              setResetting(true);
              apiFetch("/analytics/reset", { method: "POST" })
                .then(() =>
                  qc.invalidateQueries({ queryKey: ["analytics"] }),
                )
                .finally(() => setResetting(false));
            }}
            disabled={resetting}
            aria-label="Reset analytics data"
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

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

      {/* Stats */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={Activity}
            label="Requests"
            value={fmt(s.totalRequests)}
            sub={`${s.claudeCodeRequests} ok${s.errorRequests ? ` · ${s.errorRequests} err` : ""}`}
            accent="chart-1"
          />
          <StatCard
            icon={ArrowDownToLine}
            label="Input"
            value={fmt(s.totalInputTokens)}
            sub={`${fmt(s.totalCacheReadTokens)} cached`}
            accent="chart-2"
          />
          <StatCard
            icon={ArrowUpFromLine}
            label="Output"
            value={fmt(s.totalOutputTokens)}
            sub={`${fmt(s.totalCacheCreationTokens)} cache written`}
            accent="chart-3"
          />
          <StatCard
            icon={Zap}
            label="Cache hit"
            value={`${(s.cacheHitRate * 100).toFixed(1)}%`}
            sub={`${fmt(s.totalCacheReadTokens)} / ${fmt(s.totalCacheReadTokens + s.totalInputTokens + s.totalCacheCreationTokens)}`}
            accent="chart-4"
          />
        </div>
      )}

      {summary.isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {/* Chart */}
      {timeline.data && timeline.data.buckets.length > 0 && (
        <Card>
          <CardContent className="p-4 pt-4">
            <div className="text-[12px] text-muted-foreground mb-3 font-medium">
              Token usage over time
            </div>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[220px] w-full"
            >
              <AreaChart
                accessibilityLayer
                data={timeline.data.buckets}
                margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="fillInput"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-chart-1)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-chart-1)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="fillOutput"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-chart-2)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-chart-2)"
                      stopOpacity={0}
                    />
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
                    if (period === "hour")
                      return d.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    if (period === "day")
                      return d.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    return d.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={50}
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v) => fmt(v)}
                />
                <RechartsTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => {
                        const d = new Date(Number(v));
                        return d.toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                      }}
                      formatter={(value) => fmt(value)}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="inputTokens"
                  stroke="var(--color-chart-1)"
                  strokeWidth={1.5}
                  fill="url(#fillInput)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="outputTokens"
                  stroke="var(--color-chart-2)"
                  strokeWidth={1.5}
                  fill="url(#fillOutput)"
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
            <Skeleton className="h-[220px] w-full" />
          </CardContent>
        </Card>
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
              <table className="w-full text-[13px] min-w-0" aria-label="Recent API requests">
                <caption className="sr-only">
                  List of recent API requests with timing, model, tokens, and
                  status
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                    <th className="px-3 sm:px-4 py-2 font-normal whitespace-nowrap">Time</th>
                    <th className="px-3 sm:px-4 py-2 font-normal whitespace-nowrap">Model</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap">In</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap hidden sm:table-cell">Cache</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap">Out</th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap hidden md:table-cell">
                      Latency
                    </th>
                    <th className="px-3 sm:px-4 py-2 font-normal text-right whitespace-nowrap">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.data.requests.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border/50 hover:bg-card transition-colors"
                    >
                      <td className="px-3 sm:px-4 py-2.5 font-mono text-muted-foreground tabular whitespace-nowrap">
                        {new Date(r.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 font-mono truncate max-w-[120px] sm:max-w-none">
                        {r.model.replace("claude-", "")}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 font-mono text-right tabular whitespace-nowrap">
                        {fmt(r.inputTokens)}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 font-mono text-right tabular text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {r.cacheReadTokens ? fmt(r.cacheReadTokens) : "—"}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 font-mono text-right tabular whitespace-nowrap">
                        {fmt(r.outputTokens)}
                      </td>
                      <td className="px-3 sm:px-4 py-2.5 font-mono text-right text-muted-foreground tabular whitespace-nowrap hidden md:table-cell">
                        {r.latencyMs
                          ? `${(r.latencyMs / 1000).toFixed(1)}s`
                          : "—"}
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
                            <span
                              className="inline-block h-2 w-2 rounded-full bg-destructive cursor-help"
                              aria-label="Error"
                            />
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

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <Card className="group transition-colors hover:border-border/80">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{
              backgroundColor: `color-mix(in oklch, var(--color-${accent}) 15%, transparent)`,
              color: `var(--color-${accent})`,
            }}
          >
            <Icon className="h-3 w-3" />
          </div>
          <span className="text-[12px] text-muted-foreground">{label}</span>
        </div>
        <div className="font-mono text-xl font-semibold tabular">{value}</div>
        <div className="mt-0.5 text-[12px] text-muted-foreground font-mono">
          {sub}
        </div>
      </CardContent>
    </Card>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
      <span className="font-mono text-[12px] text-muted-foreground tabular">
        {total === 0 ? "0 results" : `${from}–${to} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={page <= 1}
          aria-label="Previous page"
          className="rounded border border-border px-2 py-0.5 font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          ←
        </button>
        <span className="font-mono text-[12px] text-muted-foreground tabular px-2">
          {page} / {totalPages}
        </span>
        <button
          onClick={onNext}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="rounded border border-border px-2 py-0.5 font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          →
        </button>
      </div>
    </div>
  );
}
