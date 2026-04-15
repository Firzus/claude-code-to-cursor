import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { RequestRecord } from "~/schemas/api-responses";

interface ExpandableRowProps {
  record: RequestRecord;
  formatTokens: (n: number) => string;
  formatCost: (r: RequestRecord) => string;
  formatDate: (ts: number) => string;
}

function sourceBadgeProps(source: RequestRecord["source"]): {
  label: string;
  variant: "secondary" | "destructive" | "outline";
} {
  if (source === "keepalive") return { label: "keepalive", variant: "secondary" };
  if (source === "error") return { label: "error", variant: "destructive" };
  return { label: "proxy", variant: "outline" };
}

function effortBadge(effort: string | null | undefined) {
  if (!effort) return null;
  const upper = effort.toUpperCase();
  const variant =
    upper === "HIGH" || upper === "MAX" ? "default" : upper === "LOW" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="ml-1.5 text-[9px] px-1 py-0 font-mono leading-tight">
      {upper}
    </Badge>
  );
}

export function ExpandableRow({
  record: r,
  formatTokens,
  formatCost,
  formatDate,
}: ExpandableRowProps) {
  const [open, setOpen] = useState(false);

  const src = sourceBadgeProps(r.source);
  const cacheRead = r.cacheReadTokens ?? 0;
  const cacheWrite = r.cacheCreationTokens ?? 0;
  const totalIn = r.inputTokens + cacheRead + cacheWrite;
  const cacheRate = totalIn > 0 ? (cacheRead / totalIn) * 100 : 0;
  const think = r.thinkingTokens ?? 0;

  return (
    <>
      <tr
        aria-expanded={open}
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={cn(
          "border-b border-border/50 transition-colors cursor-pointer select-none",
          open ? "bg-card/80" : "hover:bg-card/40",
        )}
      >
        <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground tabular whitespace-nowrap">
          {formatDate(r.timestamp)}
        </td>
        <td className="px-4 py-2.5 hidden sm:table-cell">
          <Badge variant={src.variant} className="text-[10px] px-1.5 py-0 font-mono">
            {src.label}
          </Badge>
        </td>
        <td className="px-4 py-2.5 font-mono text-[13px] truncate max-w-40">
          <span>{r.model.replace("claude-", "")}</span>
          {effortBadge(r.appliedThinkingEffort)}
        </td>
        <td className="px-4 py-2.5 font-mono text-[13px] text-right tabular whitespace-nowrap">
          {formatTokens(r.inputTokens + r.outputTokens + cacheRead)}
        </td>
        <td className="px-4 py-2.5 font-mono text-[13px] text-right tabular whitespace-nowrap">
          {formatCost(r)}
        </td>
        <td className="px-4 py-2.5 text-right">
          {r.source === "error" ? (
            <>
              <span
                className="inline-block h-2 w-2 rounded-full bg-destructive"
                aria-hidden="true"
              />
              <span className="sr-only">Error</span>
            </>
          ) : (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              <span className="sr-only">Success</span>
            </>
          )}
        </td>
        <td className="px-4 py-2.5 w-8">
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-150",
              open && "rotate-90",
            )}
          />
        </td>
      </tr>

      {open && (
        <tr className="border-b border-border/30 bg-card/50 animate-fade-in">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-2 text-[12px]">
              <DetailItem label="Fresh input" value={formatTokens(r.inputTokens)} />
              <DetailItem label="Output" value={formatTokens(r.outputTokens)} />
              <DetailItem
                label="Cache read"
                value={cacheRead > 0 ? formatTokens(cacheRead) : "\u2014"}
                accent={cacheRead > 0 ? "success" : undefined}
              />
              <DetailItem
                label="Cache write"
                value={cacheWrite > 0 ? formatTokens(cacheWrite) : "\u2014"}
              />
              <DetailItem
                label="Cache hit"
                value={cacheRate > 0 ? `${cacheRate.toFixed(1)}%` : "\u2014"}
                accent={cacheRate >= 80 ? "success" : cacheRate >= 40 ? "warning" : undefined}
              />
              <DetailItem label="Thinking" value={think > 0 ? formatTokens(think) : "\u2014"} />
              <DetailItem
                label="Latency"
                value={r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "\u2014"}
              />
              <DetailItem label="Route" value={r.route ?? "\u2014"} />
              {r.routingPolicy && <DetailItem label="Policy" value={r.routingPolicy} />}
              {r.error && (
                <div className="col-span-full">
                  <DetailItem label="Error" value={r.error} accent="destructive" />
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline gap-2 font-mono">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="tabular" style={{ color: accent ? `var(--color-${accent})` : undefined }}>
        {value}
      </span>
    </div>
  );
}
