import type { ReactNode } from "react";
import { Card, CardFooter, CardHeader } from "~/components/ui/card";
import { useAnalyticsSummary } from "~/hooks/use-analytics";
import { useBudgetDay } from "~/hooks/use-budget";
import { useHealth } from "~/hooks/use-health";
import { useSettings } from "~/hooks/use-settings";
import { cn } from "~/lib/utils";
import type {
  AnalyticsResponse,
  BudgetResponse,
  HealthResponse,
  SettingsResponse,
} from "~/schemas/api-responses";

function formatUsd(n: number): string {
  if (n < 0.005) return "$0.00";
  if (n < 10) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(1)}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatModel(id: string): string {
  return id.replace("claude-", "").replace(/-/g, "_");
}

type Status = "ok" | "warn" | "error" | "muted";

function StatusDot({ status }: { status: Status }) {
  const colors: Record<Status, string> = {
    ok: "bg-success",
    warn: "bg-warning",
    error: "bg-destructive",
    muted: "bg-muted-foreground",
  };
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-1.5 w-1.5 rounded-full", colors[status])}
    />
  );
}

function Row({ label, children, status }: { label: string; children: ReactNode; status?: Status }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12px] leading-5">
      <span className="text-muted-foreground uppercase tracking-[0.12em] text-[10.5px]">
        {label}
      </span>
      <span className="flex items-center gap-2 font-mono text-foreground tabular">
        {status && <StatusDot status={status} />}
        {children}
      </span>
    </div>
  );
}

function Loading() {
  return <span className="text-muted-foreground">···</span>;
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

interface QueryShape<T> {
  data: T | undefined;
  isError: boolean;
  isLoading: boolean;
}

function resolveProxyState(health: QueryShape<HealthResponse>): {
  status: Status;
  label: ReactNode;
} {
  if (health.isError) return { status: "error", label: "OFFLINE" };
  const data = health.data;
  if (!data) return { status: "muted", label: <Loading /> };
  if (!data.claudeCode.authenticated) return { status: "error", label: "UNAUTH" };
  if (data.rateLimit.isLimited) return { status: "warn", label: "LIMITED" };
  return { status: "ok", label: "ONLINE" };
}

function ModelCell({ settings }: { settings: QueryShape<SettingsResponse> }) {
  const data = settings.data?.settings;
  if (!data) return settings.isError ? <Dash /> : <Loading />;
  const { selectedModel, thinkingEnabled, thinkingEffort } = data;
  return (
    <>
      <span className="text-foreground">{formatModel(selectedModel)}</span>
      <span className="text-muted-foreground">·</span>
      {thinkingEnabled ? (
        <span className="text-accent">{thinkingEffort}</span>
      ) : (
        <span className="text-muted-foreground">no_think</span>
      )}
    </>
  );
}

function RequestsCell({ analytics }: { analytics: QueryShape<AnalyticsResponse> }) {
  if (analytics.data) return <span>{formatCount(analytics.data.totalRequests)}</span>;
  return analytics.isError ? <Dash /> : <Loading />;
}

function CacheHitCell({ analytics }: { analytics: QueryShape<AnalyticsResponse> }) {
  if (analytics.data) {
    const rate = analytics.data.cacheHitRate;
    return (
      <span className={cn(rate >= 50 ? "text-success" : "text-foreground")}>
        {rate.toFixed(1)}%
      </span>
    );
  }
  return analytics.isError ? <Dash /> : <Loading />;
}

function SpendCell({ budget }: { budget: QueryShape<BudgetResponse> }) {
  if (budget.data) return <span>{formatUsd(budget.data.estimatedUsd)}</span>;
  return budget.isError ? <Dash /> : <Loading />;
}

function TunnelCell({ health }: { health: QueryShape<HealthResponse> }) {
  const url = health.data?.tunnelUrl;
  if (url) {
    return (
      <span className="max-w-[180px] truncate text-foreground" title={url}>
        {url.replace(/^https?:\/\//, "")}
      </span>
    );
  }
  return health.isLoading ? <Loading /> : <span className="text-muted-foreground">local</span>;
}

export function StatusPanel() {
  const health = useHealth();
  const settings = useSettings();
  const analytics = useAnalyticsSummary("day");
  const budget = useBudgetDay();

  const { status: proxyStatus, label: proxyLabel } = resolveProxyState(health);
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);

  return (
    <Card
      variant="terminal"
      padding="none"
      delay={120}
      className="font-mono text-[12px]"
      role="status"
      aria-live="polite"
      aria-label="Live proxy status"
    >
      <CardHeader className="px-3 py-1.5 text-[10.5px] tracking-[0.14em]">
        <div className="flex items-center gap-1.5">
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive/70" />
            <span className="h-1.5 w-1.5 rounded-full bg-warning/70" />
            <span className="h-1.5 w-1.5 rounded-full bg-success/70" />
          </span>
          <span className="ml-2">proxy.status</span>
        </div>
        <span className="hidden sm:inline text-[10px] tabular">{timestamp} UTC</span>
      </CardHeader>

      <div className="divide-y divide-border/40 px-3 py-2">
        <Row label="Proxy" status={proxyStatus}>
          {proxyLabel}
        </Row>
        <Row label="Model">
          <ModelCell settings={settings} />
        </Row>
        <Row label="Requests_24h">
          <RequestsCell analytics={analytics} />
        </Row>
        <Row label="Cache_hit">
          <CacheHitCell analytics={analytics} />
        </Row>
        <Row label="Spend_today">
          <SpendCell budget={budget} />
        </Row>
        <Row label="Tunnel" status={health.data?.tunnelUrl ? "ok" : "muted"}>
          <TunnelCell health={health} />
        </Row>
      </div>

      <CardFooter className="px-3 py-1.5 text-[10px] tracking-[0.14em]">
        <span>$ tail -f proxy</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-success animate-pulse" />
          live
        </span>
      </CardFooter>
    </Card>
  );
}
