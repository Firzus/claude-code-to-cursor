import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAnalyticsSummary, useAnalyticsRequests } from "~/hooks/use-analytics";
import { apiFetch } from "~/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "~/lib/utils";

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

function AnalyticsPage() {
  const [period, setPeriod] = useState("day");
  const summary = useAnalyticsSummary(period);
  const requests = useAnalyticsRequests(50);
  const qc = useQueryClient();
  const [resetting, setResetting] = useState(false);

  const s = summary.data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-medium">Analytics</h1>
        <div className="flex items-center gap-3">
          {/* Period tabs */}
          <div className="flex rounded-md border border-border text-[12px]">
            {periods.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
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
            onClick={() => {
              if (!confirm("Reset all analytics?")) return;
              setResetting(true);
              apiFetch("/analytics/reset", { method: "POST" })
                .then(() => qc.invalidateQueries({ queryKey: ["analytics"] }))
                .finally(() => setResetting(false));
            }}
            disabled={resetting}
            className="rounded-md border border-border px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Stats */}
      {s && (
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border">
          <Stat label="Requests" value={fmt(s.totalRequests)} sub={`${s.claudeCodeRequests} ok${s.errorRequests ? ` · ${s.errorRequests} err` : ""}`} />
          <Stat label="Input" value={fmt(s.totalInputTokens)} sub={`${fmt(s.totalCacheReadTokens)} cached`} />
          <Stat label="Output" value={fmt(s.totalOutputTokens)} sub={`${fmt(s.totalCacheCreationTokens)} cache written`} />
          <Stat label="Cache hit" value={`${(s.cacheHitRate * 100).toFixed(1)}%`} sub={`${fmt(s.totalCacheReadTokens)} / ${fmt(s.totalCacheReadTokens + s.totalInputTokens + s.totalCacheCreationTokens)}`} />
        </div>
      )}

      {summary.isLoading && (
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-background p-5 h-24 animate-pulse" />
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border">
        <div className="px-4 py-3 text-[13px] font-medium border-b border-border">
          Recent Requests
        </div>
        {requests.isLoading ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">Loading...</div>
        ) : !requests.data?.requests.length ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">No requests yet.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-4 py-2 font-normal">Time</th>
                <th className="px-4 py-2 font-normal">Model</th>
                <th className="px-4 py-2 font-normal text-right">In</th>
                <th className="px-4 py-2 font-normal text-right">Out</th>
                <th className="px-4 py-2 font-normal text-right">Latency</th>
                <th className="px-4 py-2 font-normal text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.data.requests.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-card transition-colors">
                  <td className="px-4 py-2.5 font-mono text-muted-foreground tabular">
                    {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                  <td className="px-4 py-2.5 font-mono">{r.model.replace("claude-", "")}</td>
                  <td className="px-4 py-2.5 font-mono text-right tabular">{fmt(r.inputTokens)}</td>
                  <td className="px-4 py-2.5 font-mono text-right tabular">{fmt(r.outputTokens)}</td>
                  <td className="px-4 py-2.5 font-mono text-right text-muted-foreground tabular">
                    {r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      r.source === "error" ? "bg-destructive" : "bg-success",
                    )} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-background p-5">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-mono text-2xl font-semibold tabular">{value}</div>
      <div className="mt-1 text-[12px] text-muted-foreground font-mono">{sub}</div>
    </div>
  );
}
