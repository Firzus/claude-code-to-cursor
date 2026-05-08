"use client";

import { useHealth } from "~/hooks/use-health";
import { cn } from "~/lib/cn";
import type { Health } from "~/lib/schemas";

function statusFor(health: Health | undefined): {
  tone: "ok" | "warn" | "error" | "muted";
  label: string;
} {
  if (!health) return { tone: "muted", label: "Connecting" };
  if (!health.claudeCode.authenticated) return { tone: "error", label: "Disconnected" };
  if (health.rateLimit.isLimited) return { tone: "warn", label: "Rate limited" };
  if (health.status === "error") return { tone: "error", label: "Error" };
  return { tone: "ok", label: "Online" };
}

export function StatusPill({ initial }: { initial?: Health }) {
  const { data } = useHealth(initial);
  const { tone, label } = statusFor(data);
  const dot = {
    ok: "bg-success",
    warn: "bg-warning",
    error: "bg-destructive",
    muted: "bg-muted-foreground/60",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-full border bg-background/80 px-3 text-xs font-medium text-foreground/85 backdrop-blur",
      )}
      aria-live="polite"
    >
      <span className={cn("relative flex h-1.5 w-1.5", tone === "ok" && "animate-pulse")}>
        <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dot)} />
      </span>
      <span className="tabular">{label}</span>
    </span>
  );
}
