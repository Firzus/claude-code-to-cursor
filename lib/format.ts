export function formatCompactTokens(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 1_000) return n.toString();
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}m`;
  return `${(n / 1_000_000_000).toFixed(1)}b`;
}

/**
 * Split a number into `value` + `suffix` so animated number tickers can
 * spin the value while the suffix stays static. Used by the overview and
 * usage cards.
 */
export function compactNumber(n: number): { value: number; suffix: string; decimals: number } {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return { value: n / 1_000_000, suffix: "M", decimals: 1 };
  if (abs >= 1_000) return { value: n / 1_000, suffix: "k", decimals: 1 };
  return { value: n, suffix: "", decimals: 0 };
}

/** Drop the protocol prefix (`https://example.com` → `example.com`). */
export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/**
 * Best-effort hostname extraction. Falls back to `stripProtocol` when the
 * input isn't a valid URL (e.g. partial tunnel URL during setup).
 */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return stripProtocol(url);
  }
}

/**
 * Tick formatter for the analytics timeline X axis. Short windows (5 hours,
 * 1 day) get a `HH:mm` time; longer windows get a `MMM dd` date.
 */
export function formatTimelineTick(period: string, ts: number): string {
  const d = new Date(ts);
  if (period === "5hour" || period === "day") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 0.005) return "$0.00";
  if (n < 10) return `$${n.toFixed(2)}`;
  if (n < 1_000) return `$${n.toFixed(1)}`;
  return `$${(n / 1_000).toFixed(2)}k`;
}

export function formatPercent(n: number, fractionDigits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(fractionDigits)}%`;
}

export function formatDateTime(ts: number, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...options,
  });
}

export function formatDate(ts: number, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

export function formatRelative(ts: number, now: number = Date.now()): string {
  const diffMs = ts - now;
  const abs = Math.abs(diffMs);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60_000) return formatter.format(Math.round(diffMs / 1_000), "second");
  if (abs < 3_600_000) return formatter.format(Math.round(diffMs / 60_000), "minute");
  if (abs < 86_400_000) return formatter.format(Math.round(diffMs / 3_600_000), "hour");
  return formatter.format(Math.round(diffMs / 86_400_000), "day");
}

export function modelLabel(id: string): string {
  return id
    .replace(/^claude-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
