import "server-only";

import { logger } from "./logger";

/**
 * Live state of the cloudflared tunnel as reported by its built-in metrics
 * server (`--metrics 0.0.0.0:2000`). The `/ready` endpoint returns a JSON
 * payload describing the number of currently-open edge connections.
 *
 * - `state: "online"`      → cloudflared has at least one edge connection up.
 * - `state: "offline"`     → cloudflared is reachable but has zero connections
 *                            (e.g. transient reconnect, network glitch).
 * - `state: "unreachable"` → we couldn't reach the metrics endpoint at all
 *                            (cloudflared container down, port not exposed,
 *                            network policy).
 */
export type TunnelState = "online" | "offline" | "unreachable";

export interface TunnelStatus {
  state: TunnelState;
  /** Number of established edge connections (only set when reachable). */
  connections?: number;
  /** Round-trip latency to the metrics endpoint in ms. */
  latencyMs?: number;
  /** Last time the status was probed. */
  checkedAt: number;
  /** Optional diagnostic message for `unreachable`. */
  error?: string;
}

interface ReadyPayload {
  /** cloudflared returns `status` numerically — 200 means at least one connection. */
  status?: number;
  readyConnections?: number;
  /** Some versions expose the connector id; not consumed but kept in the type. */
  connectorId?: string;
}

const METRICS_URL = process.env.CLOUDFLARED_METRICS_URL?.trim() || "http://127.0.0.1:2000";
// 5s freshness window. Health is polled by the dashboard at most every few
// seconds; this cache guarantees we never hammer the cloudflared metrics
// server with concurrent identical probes.
const CACHE_TTL_MS = 5_000;
const PROBE_TIMEOUT_MS = 1_500;

let cached: TunnelStatus | null = null;

async function probeOnce(): Promise<TunnelStatus> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(`${METRICS_URL.replace(/\/+$/, "")}/ready`, {
      signal: controller.signal,
      cache: "no-store",
      // The metrics endpoint is plain HTTP/JSON — no auth, no headers required.
      headers: { accept: "application/json" },
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return {
        state: "unreachable",
        checkedAt: Date.now(),
        latencyMs,
        error: `metrics returned HTTP ${res.status}`,
      };
    }

    const payload = (await res.json()) as ReadyPayload;
    const connections = payload.readyConnections ?? 0;
    return {
      state: connections > 0 ? "online" : "offline",
      connections,
      latencyMs,
      checkedAt: Date.now(),
    };
  } catch (err) {
    return {
      state: "unreachable",
      checkedAt: Date.now(),
      error: (err as Error).message ?? String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns the latest tunnel status, served from a small TTL cache to keep
 * the cost negligible even under repeated polling. Always non-throwing —
 * failures collapse to `unreachable` so callers can render a degraded state
 * without try/catch noise.
 */
export async function getTunnelStatus(): Promise<TunnelStatus> {
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached;
  }

  const fresh = await probeOnce();
  cached = fresh;

  if (fresh.state === "unreachable" && fresh.error) {
    logger.verbose(`[tunnel-status] unreachable: ${fresh.error}`);
  }

  return fresh;
}
