"use client";

import { ArrowUpRight, Globe2, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { RelativeTime } from "~/components/layout/relative-time";
import { HoverLift } from "~/components/motion/hover-lift";
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
    <section
      aria-label="Proxy health"
      className="grid grid-cols-1 divide-y divide-border rounded-xl border bg-card md:grid-cols-3 md:divide-x md:divide-y-0"
    >
      <Row
        icon={<KeyRound className="size-3.5" />}
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
        icon={<ShieldCheck className="size-3.5" />}
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
        icon={<Globe2 className="size-3.5" />}
        label="Tunnel"
        tone={tunnel ? "ok" : "muted"}
        primary={tunnel ? hostnameOf(tunnel) : "Local network"}
        secondary={tunnel ? "Cloudflared online" : "No public endpoint"}
        href={tunnel ?? undefined}
        external
      />
    </section>
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
    <div className="flex h-full flex-col justify-between gap-6 p-6 md:p-7">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span aria-hidden="true" className="text-foreground/60">
            {icon}
          </span>
          {label}
        </span>
        <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="font-display text-3xl leading-tight tracking-tight">{primary}</p>
        <p className="text-sm text-muted-foreground">{secondary}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <HoverLift className="group relative block transition-colors hover:bg-accent/40" lift={1}>
        <Link
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
          className="block focus-visible:outline-none"
        >
          {inner}
          <ArrowUpRight className="absolute right-6 top-6 size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </HoverLift>
    );
  }

  return <div>{inner}</div>;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}
