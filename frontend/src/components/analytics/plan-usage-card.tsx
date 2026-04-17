import { Gauge } from "lucide-react";
import { Alert } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { usePlanUsage } from "~/hooks/use-plan-usage";
import { cn } from "~/lib/utils";
import type { PlanUsageSource, PlanUsageWindow } from "~/schemas/api-responses";
import { planLabels, type supportedPlans } from "~/schemas/settings";

function formatRelative(resetAt: number): string {
  const delta = resetAt - Date.now();
  if (delta <= 0) return "reset imminent";
  const hours = Math.floor(delta / (60 * 60 * 1000));
  const minutes = Math.floor((delta % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `resets in ${days}d ${remHours}h` : `resets in ${days}d`;
  }
  if (hours > 0) return `resets in ${hours}h ${minutes}min`;
  return `resets in ${minutes}min`;
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
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12.5px] font-medium text-foreground">{label}</span>
            {binding && (
              <Badge variant="outline" size="xs">
                binding
              </Badge>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {formatRelative(w.resetAt)}
            {sub ? ` · ${sub}` : null}
          </div>
        </div>
        <span className="font-mono text-[11.5px] text-muted-foreground tabular shrink-0">
          {displayPercent.toFixed(displayPercent > 0 && displayPercent < 10 ? 1 : 0)}% used
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(displayPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted/70"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out-quart)]",
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
      tone: "bg-success" as const,
      label: capturedAt !== null ? `live · ${formatAge(capturedAt)}` : "live",
      title: "Read from Anthropic's unified rate-limit headers on the last response.",
    },
    estimated: {
      tone: "bg-warning" as const,
      label: "estimated",
      title:
        "No recent Anthropic header snapshot — showing a local estimate based on stored tokens and public plan quotas.",
    },
    none: {
      tone: "bg-muted-foreground/50" as const,
      label: "no data yet",
      title: "Send a request through the proxy to populate usage metrics.",
    },
  }[source];

  return (
    <span
      title={config.title}
      className="inline-flex items-center gap-1.5 rounded-sm border border-border/70 bg-card/40 px-2 h-[22px] font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", config.tone)} />
      {config.label}
    </span>
  );
}

export function PlanUsageCard() {
  const query = usePlanUsage();

  if (query.isLoading) {
    return (
      <Card variant="flat" padding="lg">
        <div className="space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Alert
        variant="error"
        title="failed to load plan usage"
        action={
          <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
            retry
          </Button>
        }
      />
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
    <Card variant="flat" padding="none">
      <CardHeader
        index={<Gauge className="h-3 w-3" aria-hidden="true" />}
        title="plan usage"
        action={
          <div className="flex items-center gap-2">
            <SourceBadge source={source} capturedAt={capturedAt} />
            <span className="font-mono text-[11px] text-muted-foreground">{planLabel}</span>
          </div>
        }
      />
      <CardContent className="space-y-5 px-4 py-4">
        <UsageBar
          label="current session"
          window={usage.fiveHour}
          binding={representativeClaim === "five_hour"}
        />
        <UsageBar
          label="weekly · all models"
          window={usage.weekly}
          binding={representativeClaim === "seven_day"}
        />
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{footnote}</p>
      </CardContent>
    </Card>
  );
}
