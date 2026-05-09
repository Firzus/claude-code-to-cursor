/**
 * Shared tone palette for status indicators (StatusPill, HealthCard, …).
 * Tailwind v4 picks up these utility classes statically.
 */

export type Tone = "ok" | "warn" | "error" | "muted";

export const TONE_BG: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  muted: "bg-muted-foreground/60",
};
