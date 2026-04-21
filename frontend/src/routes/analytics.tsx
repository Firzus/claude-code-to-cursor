import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Calendar,
  Download,
  Inbox,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { AgoText } from "~/components/analytics/ago-text";
import { ConfirmDialog } from "~/components/analytics/confirm-dialog";
import { ExpandableRow } from "~/components/analytics/expandable-row";
import { Pagination } from "~/components/analytics/pagination";
import { PlanUsageCard } from "~/components/analytics/plan-usage-card";
import { RecentErrorsCard } from "~/components/analytics/recent-errors-card";
import { StatCard } from "~/components/analytics/stat-card";
import { EmptyState } from "~/components/empty-state";
import { PageHeader } from "~/components/page-header";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltipContent } from "~/components/ui/chart";
import { Segmented } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
import { Tooltip } from "~/components/ui/tooltip";
import {
  useAnalyticsRequests,
  useAnalyticsSummary,
  useAnalyticsTimeline,
} from "~/hooks/use-analytics";
import { useBudgetDay } from "~/hooks/use-budget";
import { apiFetch } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-keys";
import type { RequestRecord } from "~/schemas/api-responses";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
});

type Period = "5hour" | "day" | "week" | "month" | "all";

const periods = [
  { value: "5hour", label: "5h" },
  { value: "day", label: "24h" },
  { value: "week", label: "7d" },
  { value: "month", label: "30d" },
  { value: "all", label: "all" },
] as const satisfies readonly { value: Period; label: string }[];

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

const usageChartConfig = {
  weightedTokens: { label: "Usage", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

const PAGE_SIZE = 20;

function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("day");
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

  function handlePeriodChange(value: Period) {
    setPeriod(value);
    setPage(1);
  }

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ["analytics"] });
    qc.invalidateQueries({ queryKey: queryKeys.budget });
    qc.invalidateQueries({ queryKey: queryKeys.planUsage });
  }

  function handleReset() {
    setConfirmOpen(false);
    setResetting(true);
    apiFetch("/analytics/reset", { method: "POST" })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["analytics"] });
        qc.invalidateQueries({ queryKey: queryKeys.budget });
        qc.invalidateQueries({ queryKey: queryKeys.planUsage });
      })
      .catch(() => {})
      .finally(() => setResetting(false));
  }

  const timelineData = useMemo(() => {
    if (!timeline.data?.buckets) return undefined;
    return timeline.data.buckets.map((b) => ({
      timestamp: b.timestamp,
      weightedTokens: Math.round(
        b.inputTokens + b.outputTokens + b.cacheCreationTokens + b.cacheReadTokens * 0.1,
      ),
    }));
  }, [timeline.data?.buckets]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="~/analytics"
        title="analytics"
        subtitle=".dashboard"
        actions={
          <div className="flex items-center gap-3">
            <AgoText updatedAt={lastUpdated} />
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Period>
          options={periods}
          value={period}
          onChange={handlePeriodChange}
          ariaLabel="Time period"
          size="default"
        />
        <div className="flex items-center gap-2">
          <Tooltip content="refresh data" side="bottom">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleRefresh}
              aria-label="Refresh analytics data"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </Tooltip>
          <Tooltip content="reset all analytics" side="bottom">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setConfirmOpen(true)}
              disabled={resetting}
              aria-label="Reset analytics data"
              className="hover:border-destructive/50 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </Tooltip>
          {requests.data?.requests.length ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => requests.data && exportCsv(requests.data.requests)}
              leading={<Download className="h-3 w-3" aria-hidden="true" />}
            >
              export csv
            </Button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="reset all analytics?"
        description="This will permanently delete all recorded requests and statistics. This action cannot be undone."
        onConfirm={handleReset}
        onCancel={() => setConfirmOpen(false)}
        confirmLabel="Reset"
      />

      {/* Plan usage */}
      <PlanUsageCard />

      {/* Budget — today (UTC) */}
      {budget.isLoading && (
        <Card variant="flat" padding="lg">
          <div className="flex items-center justify-between mb-5">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-4 w-10" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        </Card>
      )}
      {budget.data &&
        (() => {
          const totalIn =
            budget.data.inputTokens + budget.data.cacheReadTokens + budget.data.cacheCreationTokens;
          const cacheHitRate = totalIn > 0 ? (budget.data.cacheReadTokens / totalIn) * 100 : 0;
          const dateLabel = new Date(budget.data.periodStart).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return (
            <Card variant="flat" padding="none">
              <CardHeader
                index={<Calendar className="h-3 w-3" aria-hidden="true" />}
                title="today"
                hint={dateLabel}
                action={
                  <span className="rounded-sm border border-border/60 bg-muted/40 px-1.5 h-[18px] inline-flex items-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    utc
                  </span>
                }
              />
              <CardContent className="grid grid-cols-3 gap-3 sm:gap-4 p-4">
                <StatCard
                  icon={ArrowDownToLine}
                  label="tokens in"
                  value={fmt(totalIn)}
                  accent="muted-foreground"
                />
                <StatCard
                  icon={ArrowUpFromLine}
                  label="tokens out"
                  value={fmt(budget.data.outputTokens)}
                  accent="muted-foreground"
                />
                <StatCard
                  icon={Zap}
                  label="cache hit rate"
                  value={pct(cacheHitRate)}
                  accent={cacheHitRate >= 50 ? "success" : "muted-foreground"}
                />
              </CardContent>
            </Card>
          );
        })()}
      {budget.isError && (
        <Alert
          variant="error"
          title="failed to load daily budget"
          action={
            <Button variant="ghost" size="sm" onClick={() => budget.refetch()}>
              retry
            </Button>
          }
        />
      )}

      {/* Recent errors */}
      <RecentErrorsCard period={period} />

      {/* Error state */}
      {summary.isError && (
        <Alert
          variant="error"
          title="failed to load analytics"
          description="The analytics API returned an error."
          action={
            <Button variant="ghost" size="sm" onClick={() => summary.refetch()}>
              retry
            </Button>
          }
        />
      )}

      {/* Chart — Weighted token usage over time */}
      {timelineData && timelineData.length > 0 && (
        <Card variant="flat" padding="none">
          <CardHeader
            index="// chart"
            title="subscription usage over time"
            hint="weighted tokens"
          />
          <CardContent className="p-4">
            <ChartContainer config={usageChartConfig} className="aspect-auto h-[200px] w-full">
              <AreaChart
                accessibilityLayer
                data={timelineData}
                margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="fillUsage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
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
                  dataKey="weightedTokens"
                  stroke="var(--color-chart-1)"
                  strokeWidth={1.5}
                  fill="url(#fillUsage)"
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {timeline.isLoading && (
        <Card variant="flat" padding="default">
          <Skeleton className="h-3 w-32 mb-3" />
          <Skeleton className="h-[200px] w-full" />
        </Card>
      )}

      {/* Requests table */}
      <Card variant="flat" padding="none">
        <CardHeader
          index="// history"
          title="request history"
          hint={requests.data ? `${requests.data.total} total` : undefined}
        />
        {requests.isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton count
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : requests.isError ? (
          <div className="p-4">
            <Alert
              variant="error"
              title="failed to load requests"
              action={
                <Button variant="ghost" size="sm" onClick={() => requests.refetch()}>
                  retry
                </Button>
              }
            />
          </div>
        ) : !requests.data?.requests.length ? (
          <EmptyState
            icon={Inbox}
            title="no requests yet"
            description="Send your first request through the proxy to see it appear here."
            className="py-12"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]" aria-label="Request history">
                <caption className="sr-only">API request history with expandable details</caption>
                <thead>
                  <tr className="border-b border-border/60 text-left font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-4 py-2 font-normal whitespace-nowrap">date</th>
                    <th className="px-4 py-2 font-normal whitespace-nowrap hidden sm:table-cell">
                      type
                    </th>
                    <th className="px-4 py-2 font-normal">model</th>
                    <th className="px-4 py-2 font-normal text-right whitespace-nowrap">tokens</th>
                    <th className="px-4 py-2 font-normal text-right whitespace-nowrap">cost</th>
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
