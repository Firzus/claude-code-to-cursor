"use client";

import { useGSAP } from "@gsap/react";
import { useMemo, useRef } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { useAnalyticsTimeline } from "~/hooks/use-analytics-timeline";
import { formatCompactTokens } from "~/lib/format";
import { ensureGsapPlugins, gsap } from "~/lib/motion";
import type { AnalyticsTimeline, Period } from "~/lib/schemas";

interface TimelineChartProps {
  period: Period;
  initial?: AnalyticsTimeline;
}

export function TimelineChart({ period, initial }: TimelineChartProps) {
  const { data, isLoading } = useAnalyticsTimeline(period, initial);
  const containerRef = useRef<HTMLDivElement>(null);

  const points = useMemo(() => {
    if (!data?.buckets) return [];
    return data.buckets.map((b) => ({
      timestamp: b.timestamp,
      tokens: Math.round(
        b.inputTokens + b.outputTokens + b.cacheCreationTokens + b.cacheReadTokens * 0.1,
      ),
    }));
  }, [data]);

  useGSAP(
    () => {
      ensureGsapPlugins();
      const node = containerRef.current;
      if (!node) return;
      const mm = gsap.matchMedia();
      mm.add(
        {
          isMotion: "(prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { isMotion } = ctx.conditions as { isMotion: boolean };
          if (!isMotion) {
            gsap.set(node, { clipPath: "inset(0 0 0 0)" });
            return;
          }
          gsap.fromTo(
            node,
            { clipPath: "inset(0 100% 0 0)" },
            { clipPath: "inset(0 0 0 0)", duration: 1.1, ease: "power3.out" },
          );
        },
      );
      return () => mm.revert();
    },
    { scope: containerRef, dependencies: [points.length, period] },
  );

  return (
    <Card className="border-none shadow-(--shadow-soft-md)">
      <CardContent className="px-6 md:px-8">
        <header className="mb-5 flex items-baseline justify-between">
          <div>
            <span className="eyebrow">Throughput</span>
            <h3 className="font-display mt-2 text-2xl tracking-tight">Weighted token usage</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Cache reads counted at 10% of equivalent fresh tokens.
          </p>
        </header>
        {isLoading && !data ? (
          <Skeleton className="h-[220px] w-full" />
        ) : points.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data in this window yet.
          </p>
        ) : (
          <div ref={containerRef} className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="2 4"
                  stroke="var(--color-border)"
                  strokeOpacity={0.6}
                />
                <XAxis
                  dataKey="timestamp"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  minTickGap={40}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickFormatter={(v: number) => {
                    const d = new Date(v);
                    if (period === "5hour" || period === "day") {
                      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    }
                    return d.toLocaleDateString([], { month: "short", day: "numeric" });
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={48}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickFormatter={(v: number) => formatCompactTokens(v)}
                />
                <RechartsTooltip
                  cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "0.625rem",
                    fontSize: "12px",
                    boxShadow: "var(--shadow-soft-md)",
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
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="var(--color-chart-1)"
                  strokeWidth={1.6}
                  fill="url(#usageFill)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
