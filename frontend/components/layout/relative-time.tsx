"use client";

import { useEffect, useState } from "react";
import { formatDateTime, formatRelative } from "~/lib/format";

interface RelativeTimeProps {
  timestamp: number;
  /** Refresh interval in ms. Default: 30s. */
  refreshMs?: number;
  prefix?: string;
}

/**
 * Renders a relative time ("3 minutes ago") that's hydration-safe.
 * On the server, we render a stable absolute timestamp; on mount,
 * we swap to the relative form and refresh on a timer.
 */
export function RelativeTime({ timestamp, refreshMs = 30_000, prefix }: RelativeTimeProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);

  if (now === null) {
    return (
      <time dateTime={new Date(timestamp).toISOString()} suppressHydrationWarning>
        {prefix ? `${prefix} ` : ""}
        {formatDateTime(timestamp)}
      </time>
    );
  }

  return (
    <time dateTime={new Date(timestamp).toISOString()} suppressHydrationWarning>
      {prefix ? `${prefix} ` : ""}
      {formatRelative(timestamp, now)}
    </time>
  );
}
