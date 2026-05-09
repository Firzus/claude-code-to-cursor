import { ArrowUpRight, Globe2 } from "lucide-react";
import Link from "next/link";
import { stripProtocol } from "~/lib/format";

interface TunnelBannerProps {
  tunnelUrl: string | null | undefined;
}

export function TunnelBanner({ tunnelUrl }: TunnelBannerProps) {
  if (!tunnelUrl) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed bg-muted/40 px-5 py-4 text-sm">
        <div className="flex items-start gap-3 text-muted-foreground">
          <Globe2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
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
      className="group flex items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4 shadow-(--shadow-soft-sm) transition-[transform,box-shadow,border-color] duration-200 ease-out hover-only:hover:-translate-y-px hover-only:hover:border-primary/30 hover-only:hover:shadow-(--shadow-soft-md)"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Globe2 className="size-4" />
        </span>
        <div className="min-w-0">
          <span className="eyebrow">Tunnel</span>
          <p className="font-mono text-sm truncate">{stripProtocol(tunnelUrl)}</p>
        </div>
      </div>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}
