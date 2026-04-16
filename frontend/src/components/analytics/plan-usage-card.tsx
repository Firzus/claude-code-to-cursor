import { AlertCircle, Gauge } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { usePlanUsage } from "~/hooks/use-plan-usage";
import { cn } from "~/lib/utils";
import type { PlanUsageSource, PlanUsageWindow } from "~/schemas/api-responses";
import { planLabels, type supportedPlans } from "~/schemas/settings";

function formatRelative(resetAt: number): string {
  const delta = resetAt - Date.now();
  if (delta <= 0) return "Reset imminent";
  const hours = Math.floor(delta / (60 * 60 * 1000));
  const minutes = Math.floor((delta % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `Resets in ${days}d ${remHours}h` : `Resets in ${days}d`;
  }
  if (hours > 0) return `Resets in ${hours}h ${minutes}min`;
  return `Resets in ${minutes}min`;
}

function formatAge(capturedAt: number): string {
  const delta = Date.now() - capturedAt;
  if (delta < 60_000) return "just now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes}min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function barColor(percent: number, status?: string): string {
  if (status === "rate_limited" || status === "rejected") return "bg-destructive";
  if (percent >= 90) return "bg-destructive";
  if (status === "warning" || status === "allowed_warning" || percent >= 70) return "bg-warning";
  return "bg-accent";
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function windowSub(w: PlanUsageWindow): string | undefined {
  if (w.tokens !== undefined && w.limit !== undefined) {
    return `${fmtTokens(w.tokens)} / ${fmtTokens(w.limit)}`;
  }
  return undefined;
}

interface UsageBarProps {
  label: string;
  window: PlanUsageWindow;
  binding?: boolean;
}

function UsageBar({ label, window: w, binding }: UsageBarProps) {
  const displayPercent = Math.min(100, Math.max(0, w.percent));
  const sub = windowSub(w);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium">{label}</span>
            {binding && (
              <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                Binding
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
            {formatRelative(w.resetAt)}
            {sub ? ` · ${sub}` : null}
          </div>
        </div>
        <span className="text-[12px] text-muted-foreground font-mono tabular-nums shrink-0">
          {displayPercent.toFixed(displayPercent > 0 && displayPercent < 10 ? 1 : 0)}% used
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            barColor(w.percent, w.status),
          )}
          style={{ width: `${displayPercent}%` }}
        />
      </div>
    </div>
  );
}

interface SourceBadgeProps {
  source: PlanUsageSource;
  capturedAt: number | null;
}

function SourceBadge({ source, capturedAt }: SourceBadgeProps) {
  const config = {
    anthropic: {
      dot: "bg-success",
      label: capturedAt !== null ? `Live · ${formatAge(capturedAt)}` : "Live",
      title: "Read from Anthropic's unified rate-limit headers on the last response.",
    },
    estimated: {
      dot: "bg-warning",
      label: "Estimated",
      title:
        "No recent Anthropic header snapshot — showing a local estimate based on stored tokens and public plan quotas.",
    },
    none: {
      dot: "bg-muted-foreground/50",
      label: "No data yet",
      title: "Send a request through the proxy to populate usage metrics.",
    },
  }[source];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
      title={config.title}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}

export function PlanUsageCard() {
  const query = usePlanUsage();

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="p-5 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-center gap-2 py-3 text-[12px] text-destructive">
          <AlertCircle className="h-4 w-4" />
          Failed to load plan usage.
          <button
            type="button"
            onClick={() => query.refetch()}
            className="underline underline-offset-2 cursor-pointer"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  const { plan, usage, source, capturedAt, representativeClaim } = query.data;
  const planLabel = planLabels[plan as (typeof supportedPlans)[number]];

  const footnote =
    source === "anthropic"
      ? "Authoritative data from Anthropic's unified rate-limit headers — the same metric Claude.ai and the Claude Code CLI use."
      : source === "estimated"
        ? "Estimated from local token counts — Anthropic snapshot unavailable. Quotas are public approximations."
        : "No traffic yet. Metrics will update after the first request through the proxy.";

  return (
    <Card className="border-border/80">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[12px] text-muted-foreground font-medium">Plan usage</span>
            <SourceBadge source={source} capturedAt={capturedAt} />
          </div>
          <span className="text-[12px] font-mono text-muted-foreground">{planLabel}</span>
        </div>

        <UsageBar
          label="Current session"
          window={usage.fiveHour}
          binding={representativeClaim === "five_hour"}
        />

        <UsageBar
          label="Weekly · All models"
          window={usage.weekly}
          binding={representativeClaim === "seven_day"}
        />

        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{footnote}</p>
      </CardContent>
    </Card>
  );
}
