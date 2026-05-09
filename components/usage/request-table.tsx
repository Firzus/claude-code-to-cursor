"use client";

import { ChevronDown, Inbox } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useAnalyticsRequests } from "~/hooks/use-analytics-requests";
import { cn } from "~/lib/cn";
import { formatCompactTokens, formatDateTime, formatUsd, modelLabel } from "~/lib/format";
import type { AnalyticsRequests, Period, RequestRecord } from "~/lib/schemas";
import { ExportCsvButton } from "./export-csv-button";

interface RequestTableProps {
  period: Period;
  pageSize: number;
  initial?: AnalyticsRequests;
}

// Cursor pagination state lives in component state. Each "Next" pushes the
// current cursor onto the stack; "Previous" pops back. Refresh resets to
// page 1 — that's a deliberate trade-off for keeping URLs clean and the
// implementation simple. The user-facing "Page X of Y" still works because
// X = stack.length + 1 and Y is derived from total/pageSize.
export function RequestTable({ period, pageSize, initial }: RequestTableProps) {
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  // `pinnedSince` is the `since` value the server used on page 1. Once we
  // start paginating we MUST reuse it or Convex's cursor invalidates.
  const [pinnedSince, setPinnedSince] = useState<number | null>(initial?.since ?? null);
  // React 19 idiom for "reset state when a prop changes" — branch in render
  // (not in an effect). The render runs again with the new state immediately.
  const [prevPeriod, setPrevPeriod] = useState(period);
  if (period !== prevPeriod) {
    setPrevPeriod(period);
    setCursorStack([]);
    setPinnedSince(null);
  }
  const currentCursor = cursorStack.at(-1) ?? null;

  // Only seed `initial` for the first page. After we navigate, `initial` is
  // stale (it's always the page-1 snapshot from SSR).
  const fallback = cursorStack.length === 0 ? initial : undefined;
  const { data, isLoading, error } = useAnalyticsRequests(
    period,
    pageSize,
    currentCursor,
    pinnedSince,
    fallback,
  );

  // Capture the server's `since` from the first response of this period so
  // we can echo it back on subsequent pages.
  if (data && pinnedSince === null) {
    setPinnedSince(data.since);
  }

  const [expanded, setExpanded] = useState<string | null>(null);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageIndex = cursorStack.length + 1;

  const canGoPrev = cursorStack.length > 0;
  const canGoNext = data ? !data.isDone : false;

  function goPrev() {
    setCursorStack((s) => s.slice(0, -1));
  }

  function goNext() {
    if (!data || data.isDone) return;
    setCursorStack((s) => [...s, data.continueCursor]);
  }

  return (
    <section aria-label="Request history" className="rounded-xl border bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b px-6 py-5 md:px-8">
        <div className="space-y-2">
          <span className="eyebrow">Request history</span>
          <h3 className="font-display text-2xl leading-tight tracking-tight">
            {total} {total === 1 ? "request" : "requests"}
          </h3>
        </div>
        <ExportCsvButton requests={data?.requests ?? []} disabled={isLoading} />
      </header>

      {isLoading && !data ? (
        <div className="space-y-2 px-6 py-6 md:px-8">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton placeholders
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="px-6 py-12 text-sm text-muted-foreground md:px-8">
          We couldn&apos;t load the requests log. Retry, or check the API service.
        </div>
      ) : !data?.requests.length ? (
        <EmptyState />
      ) : (
        <>
          <div
            className={cn(
              "relative overflow-x-auto",
              "[mask-image:linear-gradient(to_right,black_0,black_calc(100%-2.5rem),transparent_100%)]",
              "sm:[mask-image:none]",
            )}
          >
            <table className="w-full text-sm min-w-[640px] sm:min-w-0" aria-label="Request history">
              <caption className="sr-only">API request history with expandable details</caption>
              <thead>
                <tr className="border-b text-left text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <th scope="col" className="px-6 py-3 font-mono font-normal md:px-8">
                    When
                  </th>
                  <th scope="col" className="px-3 py-3 font-mono font-normal">
                    Model
                  </th>
                  <th scope="col" className="hidden px-3 py-3 font-mono font-normal sm:table-cell">
                    Route
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-mono font-normal">
                    Tokens
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-3 text-right font-mono font-normal md:table-cell"
                  >
                    Latency
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-mono font-normal">
                    Cost
                  </th>
                  <th scope="col" className="px-6 py-3 md:px-8">
                    <span className="sr-only">Expand</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.requests.map((r) => {
                  const open = expanded === r.id;
                  return (
                    <ExpandableRow
                      key={r.id}
                      record={r}
                      open={open}
                      onToggle={() => setExpanded(open ? null : r.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="flex items-center justify-between border-t px-6 py-4 text-xs text-muted-foreground md:px-8">
            <span className="tabular">
              Page {pageIndex} of {pageCount}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!canGoPrev} onClick={goPrev}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={!canGoNext} onClick={goNext}>
                Next
              </Button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

function ExpandableRow({
  record: r,
  open,
  onToggle,
}: {
  record: RequestRecord;
  open: boolean;
  onToggle: () => void;
}) {
  const totalIn = r.inputTokens + (r.cacheReadTokens ?? 0) + (r.cacheCreationTokens ?? 0);

  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-b transition-colors duration-150",
          "hover-only:hover:bg-accent/40 focus-within:bg-accent/40",
          r.source === "error" && "bg-destructive/[0.03]",
        )}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
      >
        <td className="px-6 py-3 font-mono text-xs text-muted-foreground md:px-8">
          {formatDateTime(r.timestamp)}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                r.source === "error" ? "bg-destructive" : "bg-success",
              )}
            />
            <span className="font-medium">{modelLabel(r.model)}</span>
          </div>
        </td>
        <td className="hidden px-3 py-3 sm:table-cell">
          {r.route ? (
            <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {r.route}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-3 text-right font-mono text-xs tabular">
          {formatCompactTokens(totalIn)} <span className="text-muted-foreground">·</span>{" "}
          {formatCompactTokens(r.outputTokens)}
        </td>
        <td className="hidden px-3 py-3 text-right font-mono text-xs tabular md:table-cell">
          {r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"}
        </td>
        <td className="px-3 py-3 text-right font-mono text-xs tabular">
          {formatUsd(r.estimatedUsd ?? 0)}
        </td>
        <td className="px-6 py-3 text-right md:px-8">
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200 ease-out",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </td>
      </tr>
      {open ? (
        <tr className="border-b bg-accent/20">
          <td colSpan={7} className="px-6 py-5 md:px-8">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs md:grid-cols-4">
              <Field label="Input" value={formatCompactTokens(r.inputTokens)} />
              <Field label="Output" value={formatCompactTokens(r.outputTokens)} />
              <Field label="Cache read" value={formatCompactTokens(r.cacheReadTokens ?? 0)} />
              <Field label="Cache write" value={formatCompactTokens(r.cacheCreationTokens ?? 0)} />
              <Field
                label="Thinking"
                value={r.thinkingTokens ? formatCompactTokens(r.thinkingTokens) : "—"}
              />
              <Field label="Effort" value={r.appliedThinkingEffort ?? "—"} />
              <Field label="Stream" value={r.stream ? "yes" : "no"} />
              <Field label="Tools" value={r.toolDefsCount?.toString() ?? "0"} />
              {r.routingPolicy ? <Field label="Policy" value={r.routingPolicy} /> : null}
              {r.messageCount ? <Field label="Messages" value={r.messageCount.toString()} /> : null}
            </dl>
            {r.error ? (
              <pre className="mt-4 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 font-mono text-[11px] leading-relaxed text-destructive">
                {r.error}
              </pre>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="flex size-9 items-center justify-center rounded-full border bg-background text-muted-foreground">
        <Inbox className="size-3.5" />
      </span>
      <p className="font-display text-xl tracking-tight">No requests in this window</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Try a wider period, or send a request through the proxy to see it appear here.
      </p>
    </div>
  );
}
