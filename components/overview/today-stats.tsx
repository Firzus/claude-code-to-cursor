"use client";

import { ArrowDownToLine, ArrowUpFromLine, Sparkles } from "lucide-react";
import { NumberTicker } from "~/components/motion/number-ticker";
import { Card, CardContent } from "~/components/ui/card";
import { useBudget } from "~/hooks/use-budget";
import { cn } from "~/lib/cn";
import type { Budget } from "~/lib/schemas";

interface TodayStatsProps {
  initial?: Budget;
}

function compactSuffix(n: number): { value: number; suffix: string; decimals: number } {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return { value: n / 1_000_000, suffix: "M", decimals: 1 };
  if (abs >= 1_000) return { value: n / 1_000, suffix: "k", decimals: 1 };
  return { value: n, suffix: "", decimals: 0 };
}

export function TodayStats({ initial }: TodayStatsProps) {
  const { data } = useBudget(initial);

  const totalIn =
    (data?.inputTokens ?? 0) + (data?.cacheReadTokens ?? 0) + (data?.cacheCreationTokens ?? 0);
  const cacheHit = totalIn > 0 ? ((data?.cacheReadTokens ?? 0) / totalIn) * 100 : 0;
  const totalOut = data?.outputTokens ?? 0;
  const spend = data?.estimatedUsd ?? 0;

  const inFmt = compactSuffix(totalIn);
  const outFmt = compactSuffix(totalOut);

  return (
    <Card className="border-none shadow-(--shadow-soft-md)">
      <CardContent className="grid grid-cols-2 gap-6 px-5 py-6 sm:gap-7 md:grid-cols-4 md:px-8 md:py-7">
        <Stat
          icon={<ArrowDownToLine className="size-4" />}
          label="Tokens in"
          numeric={
            <NumberTicker
              value={inFmt.value}
              decimals={inFmt.decimals}
              suffix={inFmt.suffix}
              duration={1}
            />
          }
          hint="Today, UTC"
        />
        <Stat
          icon={<ArrowUpFromLine className="size-4" />}
          label="Tokens out"
          numeric={
            <NumberTicker
              value={outFmt.value}
              decimals={outFmt.decimals}
              suffix={outFmt.suffix}
              duration={1}
            />
          }
          hint="Generated today"
        />
        <Stat
          icon={<Sparkles className="size-4" />}
          label="Cache hit"
          numeric={<NumberTicker value={cacheHit} decimals={1} suffix="%" duration={1.1} />}
          hint={cacheHit >= 50 ? "Strong reuse" : "Warming up"}
          tone={cacheHit >= 50 ? "success" : "neutral"}
        />
        <Stat
          icon={<span className="font-mono text-sm leading-none">$</span>}
          label="Estimated spend"
          numeric={<NumberTicker value={spend} prefix="$" decimals={2} duration={1.2} />}
          hint="Heuristic"
        />
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  numeric,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  numeric: React.ReactNode;
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
            "font-display text-3xl tabular tracking-tight md:text-[2rem]",
            tone === "success" && "text-success",
          )}
        >
          {numeric}
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
