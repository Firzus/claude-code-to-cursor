"use client";

import { ArrowUpRight, Globe2 } from "lucide-react";
import Link from "next/link";

interface TunnelBannerProps {
  tunnelUrl: string | null | undefined;
}

export function TunnelBanner({ tunnelUrl }: TunnelBannerProps) {
  if (!tunnelUrl) {
    return (
      <div className="flex items-center justify-between rounded-2xl border-dashed border bg-muted/40 px-5 py-4 text-sm">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Globe2 className="size-4" />
          <span>
            No tunnel detected — your proxy is reachable from this network only. Configure
            Cloudflared to expose it publicly.
          </span>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={tunnelUrl}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex items-center justify-between rounded-2xl border bg-card px-5 py-4 shadow-(--shadow-soft-sm) transition-shadow hover:shadow-(--shadow-soft-md)"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Globe2 className="size-4" />
        </span>
        <div>
          <span className="eyebrow">Tunnel</span>
          <p className="font-mono text-sm">{tunnelUrl.replace(/^https?:\/\//, "")}</p>
        </div>
      </div>
      <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}
