"use client";

import { ArrowDownToLine, ArrowUpFromLine, Sparkles } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { useBudget } from "~/hooks/use-budget";
import { cn } from "~/lib/cn";
import { formatCompactTokens, formatPercent, formatUsd } from "~/lib/format";
import type { Budget } from "~/lib/schemas";

interface TodayStatsProps {
  initial?: Budget;
}

export function TodayStats({ initial }: TodayStatsProps) {
  const { data } = useBudget(initial);

  const totalIn =
    (data?.inputTokens ?? 0) + (data?.cacheReadTokens ?? 0) + (data?.cacheCreationTokens ?? 0);
  const cacheHit = totalIn > 0 ? ((data?.cacheReadTokens ?? 0) / totalIn) * 100 : 0;
  const totalOut = data?.outputTokens ?? 0;

  return (
    <Card className="border-none shadow-(--shadow-soft-md)">
      <CardContent className="grid grid-cols-1 gap-6 px-6 md:grid-cols-4 md:px-8">
        <Stat
          icon={<ArrowDownToLine className="size-4" />}
          label="Tokens in"
          value={formatCompactTokens(totalIn)}
          hint="Today, UTC"
        />
        <Stat
          icon={<ArrowUpFromLine className="size-4" />}
          label="Tokens out"
          value={formatCompactTokens(totalOut)}
          hint="Generated today"
        />
        <Stat
          icon={<Sparkles className="size-4" />}
          label="Cache hit"
          value={formatPercent(cacheHit)}
          hint={cacheHit >= 50 ? "Strong reuse" : "Warming up"}
          tone={cacheHit >= 50 ? "success" : "neutral"}
        />
        <Stat
          icon={<span className="font-mono text-sm leading-none">$</span>}
          label="Estimated spend"
          value={formatUsd(data?.estimatedUsd ?? 0)}
          hint="Heuristic"
        />
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "success";
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="space-y-1">
        <span className="eyebrow">{label}</span>
        <p
          className={cn(
            "font-display text-3xl tabular tracking-tight",
            tone === "success" && "text-success",
          )}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
