import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Tooltip } from "~/components/ui/tooltip";
import { useAnalyticsErrors } from "~/hooks/use-analytics";
import type { ErrorRecord } from "~/schemas/api-responses";

interface RecentErrorsCardProps {
  period: string;
}

function formatAgo(ts: number): string {
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RecentErrorsCard({ period }: RecentErrorsCardProps) {
  const query = useAnalyticsErrors(period);

  if (query.isLoading) {
    return (
      <Card variant="flat" padding="none">
        <CardHeader index="// errors" title="recent errors" />
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card variant="flat" padding="none">
        <CardHeader index="// errors" title="recent errors" />
        <CardContent className="p-4">
          <Alert
            variant="error"
            title="failed to load errors"
            action={
              <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
                retry
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const data = query.data;
  if (!data) return null;

  // Hide the card entirely on brand-new installs (no errors ever recorded).
  if (data.totalAllTime === 0) return null;

  const { errors, total } = data;

  return (
    <Card variant="flat" padding="none">
      <CardHeader
        index="// errors"
        title="recent errors"
        hint={`${total} in window`}
        action={
          total > 0 ? (
            <Badge variant="destructive" size="xs">
              {total}
            </Badge>
          ) : (
            <Badge variant="success" size="xs">
              0
            </Badge>
          )
        }
      />
      {errors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-success/30 bg-success/10 text-success mb-3">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <p className="font-mono text-[12px] text-foreground mb-0.5">no errors in this window</p>
          <p className="text-[11px] text-muted-foreground">
            {data.totalAllTime} total all-time. Try a wider time range.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/40" aria-label="Recent error requests">
          {errors.map((e) => (
            <ErrorRow key={e.id} record={e} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ErrorRow({ record }: { record: ErrorRecord }) {
  const message = record.error ?? "unknown error";
  const model = record.model.replace("claude-", "");
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-[12.5px] hover:bg-card/40 transition-colors">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground shrink-0 tabular w-16">
        {formatAgo(record.timestamp)}
      </span>
      <span className="font-mono text-[12px] text-foreground/90 shrink-0 truncate max-w-[8rem]">
        {model}
      </span>
      <Tooltip content={message} side="top" align="start">
        <span
          className="flex-1 min-w-0 truncate font-mono text-[12px] text-destructive cursor-default"
          title={message}
        >
          {message}
        </span>
      </Tooltip>
      <span className="font-mono text-[11px] text-muted-foreground shrink-0 tabular">
        {formatLatency(record.latencyMs)}
      </span>
    </li>
  );
}
