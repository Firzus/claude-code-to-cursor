"use client";

import { ArrowUpRight, Globe2, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { RelativeTime } from "~/components/layout/relative-time";
import { Card, CardContent } from "~/components/ui/card";
import { useHealth } from "~/hooks/use-health";
import { cn } from "~/lib/cn";
import type { Health } from "~/lib/schemas";

export function HealthCard({ initial }: { initial?: Health }) {
  const { data } = useHealth(initial);

  const tunnel = data?.tunnelUrl;
  const authenticated = data?.claudeCode.authenticated ?? false;
  const expiresAt = data?.claudeCode.expiresAt ?? null;
  const limited = data?.rateLimit.isLimited ?? false;

  return (
    <Card className="border-none shadow-(--shadow-soft-md)">
      <CardContent className="grid grid-cols-1 gap-6 px-6 md:grid-cols-3 md:px-8">
        <Row
          icon={<KeyRound className="size-4" />}
          label="OAuth"
          tone={authenticated ? "ok" : "error"}
          primary={authenticated ? "Connected" : "Not connected"}
          secondary={
            expiresAt ? (
              <RelativeTime timestamp={expiresAt} prefix="Refreshes" />
            ) : authenticated ? (
              "Token live"
            ) : (
              "Connect via /integrations"
            )
          }
          href={authenticated ? undefined : "/integrations"}
        />
        <Row
          icon={<ShieldCheck className="size-4" />}
          label="Rate limit"
          tone={limited ? "warn" : "ok"}
          primary={limited ? "Backpressure" : "Healthy"}
          secondary={
            limited && data?.rateLimit.minutesRemaining
              ? `Cools down in ${data.rateLimit.minutesRemaining}m`
              : "All upstream traffic accepted"
          }
        />
        <Row
          icon={<Globe2 className="size-4" />}
          label="Tunnel"
          tone={tunnel ? "ok" : "muted"}
          primary={tunnel ? hostnameOf(tunnel) : "Local network"}
          secondary={tunnel ? "Cloudflared online" : "No public endpoint"}
          href={tunnel ?? undefined}
          external
        />
      </CardContent>
    </Card>
  );
}

function Row({
  icon,
  label,
  primary,
  secondary,
  tone,
  href,
  external = false,
}: {
  icon: ReactNode;
  label: string;
  primary: string;
  secondary: ReactNode;
  tone: "ok" | "warn" | "error" | "muted";
  href?: string;
  external?: boolean;
}) {
  const dotClass = {
    ok: "bg-success",
    warn: "bg-warning",
    error: "bg-destructive",
    muted: "bg-muted-foreground/60",
  }[tone];

  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span
          className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="eyebrow flex items-center gap-2">
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dotClass)} />
          {label}
        </span>
      </div>
      <div className="space-y-1">
        <p className="font-display text-2xl tracking-tight">{primary}</p>
        <p className="text-sm text-muted-foreground">{secondary}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer noopener" : undefined}
        className="group flex flex-col gap-3 rounded-lg p-2 transition-colors hover:bg-muted/40"
      >
        <div className="flex items-start justify-between">
          <span className="sr-only">{label}</span>
          <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        {inner}
      </Link>
    );
  }

  return <div className="flex flex-col gap-3">{inner}</div>;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}
