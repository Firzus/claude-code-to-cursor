/**
 * Event-loop lag monitor.
 *
 * Schedules a 100 ms interval and measures how late each tick fires; the
 * delta beyond 100 ms is event-loop lag (synchronous CPU work blocking the
 * loop). Keeps a 1-minute ring buffer of samples so /health can expose
 * p50 / p95 / max — useful to validate that performance fixes actually
 * lowered the lag and to debug live regressions.
 *
 * Cost: one timestamp diff every 100 ms. Negligible.
 */

const SAMPLE_INTERVAL_MS = 100;
const SAMPLE_WINDOW_MS = 60_000;

interface Sample {
  at: number;
  lagMs: number;
}

// performance.now() is monotonic; using it for both `at` and `lastTick`
// makes the window cutoff a reliable bound on `samples.length` even if the
// system clock jumps (NTP, VM skew under Docker).
const samples: Sample[] = [];
let lastTick = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function pushSample(lagMs: number): void {
  const now = performance.now();
  samples.push({ at: now, lagMs });
  const cutoff = now - SAMPLE_WINDOW_MS;
  while (samples.length > 0 && samples[0] && samples[0].at < cutoff) {
    samples.shift();
  }
}

export function startEventLoopMonitor(): void {
  if (timer) return;
  lastTick = performance.now();
  timer = setInterval(() => {
    const now = performance.now();
    const lag = Math.max(0, now - lastTick - SAMPLE_INTERVAL_MS);
    lastTick = now;
    pushSample(lag);
  }, SAMPLE_INTERVAL_MS);
  // Don't keep the process alive solely for this timer.
  (timer as NodeJS.Timeout).unref?.();
}

export function stopEventLoopMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

export interface EventLoopLagSnapshot {
  /** Number of samples in the window (≈600 at full minute). */
  samples: number;
  /** 50th percentile of recent lag, in ms. */
  p50: number;
  /** 95th percentile of recent lag, in ms. */
  p95: number;
  /** Worst lag in the window, in ms. */
  max: number;
  /** Window width in ms. */
  windowMs: number;
}

export function getEventLoopLag(): EventLoopLagSnapshot {
  const values = samples.map((s) => s.lagMs).sort((a, b) => a - b);
  return {
    samples: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: values.length > 0 ? (values[values.length - 1] ?? 0) : 0,
    windowMs: SAMPLE_WINDOW_MS,
  };
}

/** @internal for tests */
export function __resetEventLoopMonitor(): void {
  stopEventLoopMonitor();
  samples.length = 0;
  lastTick = 0;
}
