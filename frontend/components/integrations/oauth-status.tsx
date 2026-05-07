"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";
import { RelativeTime } from "~/components/layout/relative-time";
import { useHealth } from "~/hooks/use-health";
import { cn } from "~/lib/cn";
import type { Health } from "~/lib/schemas";

export function OAuthStatus({ initial }: { initial?: Health }) {
  const { data } = useHealth(initial);
  const authenticated = data?.claudeCode.authenticated ?? false;
  const expiresAt = data?.claudeCode.expiresAt ?? null;

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-(--shadow-soft-sm)",
        authenticated ? "border-success/30" : "border-destructive/30",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          authenticated ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
        )}
      >
        {authenticated ? <CheckCircle2 className="size-5" /> : <ShieldAlert className="size-5" />}
      </span>
      <div className="space-y-1">
        <h3 className="font-display text-lg leading-tight tracking-tight">
          {authenticated ? "Authorized" : "Not connected"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {authenticated ? (
            expiresAt ? (
              <>
                Token refreshes itself; current credential expires{" "}
                <RelativeTime timestamp={expiresAt} />.
              </>
            ) : (
              "Token is live and refreshing on demand."
            )
          ) : (
            "Connect with Claude Code to start routing requests."
          )}
        </p>
      </div>
    </div>
  );
}
