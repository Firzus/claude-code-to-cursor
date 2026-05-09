"use client";

import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "~/components/ui/skeleton";
import { useAnalyticsTimeline } from "~/hooks/use-analytics-timeline";
import { formatCompactTokens, formatTimelineTick } from "~/lib/format";
import { ensureGsapPlugins, gsap, withReducedMotion } from "~/lib/motion";
import type { AnalyticsTimeline, Period } from "~/lib/schemas";

interface TimelineChartProps {
  period: Period;
  initial?: AnalyticsTimeline;
}

export function TimelineChart({ period, initial }: TimelineChartProps) {
  const { data, isLoading } = useAnalyticsTimeline(period, initial);
  const containerRef = useRef<HTMLDivElement>(null);

  // Recharts only re-renders when the array reference changes, and the
  // outer component already only re-renders when `data` changes via SWR.
  // Memoising buys nothing here — a fresh map every render is cheap (24 items).
  const points =
    data?.buckets.map((b) => ({
      timestamp: b.timestamp,
      tokens: Math.round(
        b.inputTokens + b.outputTokens + b.cacheCreationTokens + b.cacheReadTokens * 0.1,
      ),
    })) ?? [];

  useGSAP(
    () => {
      ensureGsapPlugins();
      const node = containerRef.current;
      if (!node) return;
      return withReducedMotion((isMotion) => {
        if (!isMotion) {
          gsap.set(node, { clipPath: "inset(0 0 0 0)" });
          return;
        }
        gsap.fromTo(
          node,
          { clipPath: "inset(0 100% 0 0)" },
          { clipPath: "inset(0 0 0 0)", duration: 1.1, ease: "power3.out" },
        );
      });
    },
    { scope: containerRef, dependencies: [points.length, period] },
  );

  return (
    <section aria-label="Throughput timeline" className="rounded-xl border bg-card">
      <header className="flex items-baseline justify-between border-b px-6 py-5 md:px-8">
        <div className="space-y-2">
          <span className="eyebrow">Throughput</span>
          <h3 className="font-display text-2xl leading-tight tracking-tight">
            Weighted token usage
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Cache reads counted at 10% of equivalent fresh tokens.
        </p>
      </header>
      <div className="px-2 py-6 md:px-4">
        {isLoading && !data ? (
          <Skeleton className="mx-4 h-[220px] w-[calc(100%-2rem)]" />
        ) : points.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data in this window yet.
          </p>
        ) : (
          <div ref={containerRef} className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="2 6"
                  stroke="var(--color-border)"
                  strokeOpacity={0.7}
                />
                <XAxis
                  dataKey="timestamp"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  minTickGap={40}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickFormatter={(v: number) => formatTimelineTick(period, v)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={48}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickFormatter={(v: number) => formatCompactTokens(v)}
                />
                <RechartsTooltip
                  cursor={{ stroke: "var(--color-primary)", strokeWidth: 1, strokeOpacity: 0.4 }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "0.5rem",
                    fontSize: "12px",
                    boxShadow: "var(--shadow-floating)",
                  }}
                  labelFormatter={(v) => {
                    const d = new Date(Number(v));
                    return d.toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  }}
                  formatter={(v) => [formatCompactTokens(Number(v ?? 0)), "Weighted tokens"]}
                />
                <Line
                  type="monotone"
                  dataKey="tokens"
                  stroke="var(--color-primary)"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: "var(--color-primary)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
