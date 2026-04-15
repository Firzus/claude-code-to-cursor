/**
 * Cache keepalive: sends a lightweight ping on an interval to keep
 * Anthropic's prompt cache warm. The ephemeral cache TTL is 5 minutes,
 * so pinging at 4-minute intervals prevents expiry between conversations.
 *
 * Pings are skipped unless there was a successful user proxy request
 * within the last 5 minutes (activity gating).
 *
 * Inspired by Aider's --cache-keepalive-pings feature.
 */

import { ANTHROPIC_API_URL, CLAUDE_CODE_USER_AGENT, getClaudeCodeBetaHeaders } from "./config";
import { getModelSettings, recordRequest } from "./db";
import { logger } from "./logger";
import { getKeepaliveIntervalMs } from "./model-settings";
import { getValidToken } from "./oauth";
import { hasRecentProxyActivity } from "./proxy-activity";
import type { AnthropicRequest, ContentBlock, Tool } from "./types";

/** Only ping if a real proxy request completed within this window. */
const PROXY_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;

interface CachedPrefix {
  model: string;
  system: ContentBlock[];
  tools: Tool[];
}

let lastPrefix: CachedPrefix | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Called after every successful request to store the cacheable prefix.
 * Only updates if the prefix actually changed.
 */
export function updateCachePrefix(prepared: AnthropicRequest): void {
  const system = Array.isArray(prepared.system) ? (prepared.system as ContentBlock[]) : [];
  const tools = prepared.tools ?? [];

  lastPrefix = {
    model: prepared.model,
    system,
    tools,
  };
}

/**
 * Sends a minimal request that touches the same cache prefix
 * (tools + system) to keep it warm without generating real output.
 */
async function sendKeepalivePing(): Promise<void> {
  const settings = getModelSettings();
  if (settings.keepaliveInterval === "off") return;
  if (!lastPrefix) return;
  if (!hasRecentProxyActivity(PROXY_ACTIVITY_WINDOW_MS)) return;

  const token = await getValidToken();
  if (!token) return;

  const body: Record<string, unknown> = {
    model: lastPrefix.model,
    system: lastPrefix.system,
    messages: [{ role: "user", content: "." }],
    max_tokens: 1,
  };

  if (lastPrefix.tools.length > 0) {
    body.tools = lastPrefix.tools;
  }

  const betaHeaders = getClaudeCodeBetaHeaders({
    extendedCacheTtl: settings.cacheTTL === "1h",
  });

  try {
    const response = await fetch(`${ANTHROPIC_API_URL}/v1/messages?beta=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "anthropic-beta": betaHeaders,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "User-Agent": CLAUDE_CODE_USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      const text = await response.text();
      try {
        const data = JSON.parse(text) as {
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
        };
        const u = data.usage;
        recordRequest({
          model: lastPrefix.model,
          source: "keepalive",
          inputTokens: u?.input_tokens ?? 0,
          outputTokens: u?.output_tokens ?? 0,
          cacheReadTokens: u?.cache_read_input_tokens ?? 0,
          cacheCreationTokens: u?.cache_creation_input_tokens ?? 0,
          stream: false,
        });
      } catch {
        // Non-JSON or missing usage — still counted as successful ping
      }
      logger.info("[Cache Keepalive] Ping sent successfully");
    } else {
      if (response.status !== 429) {
        logger.info(`[Cache Keepalive] Ping returned ${response.status}, skipping`);
      }
      await response.text().catch(() => {});
    }
  } catch (err) {
    logger.info(`[Cache Keepalive] Ping failed: ${err}`);
  }
}

/**
 * Restart the keepalive timer from current model settings (interval + off).
 * Safe to call multiple times.
 */
export function restartCacheKeepalive(): void {
  stopCacheKeepalive();

  const settings = getModelSettings();
  const intervalMs = getKeepaliveIntervalMs(settings.keepaliveInterval);
  if (intervalMs <= 0) {
    console.log("✓ Cache keepalive disabled (keepaliveInterval=off)");
    return;
  }

  keepaliveTimer = setInterval(() => {
    void sendKeepalivePing();
  }, intervalMs);

  console.log(
    `✓ Cache keepalive enabled (every ${intervalMs / 1000}s, activity gate ${PROXY_ACTIVITY_WINDOW_MS / 60_000}min)`,
  );
}

/**
 * Start the keepalive timer. Safe to call multiple times (restarts the timer).
 */
export function startCacheKeepalive(): void {
  restartCacheKeepalive();
}

/**
 * Stop the keepalive timer.
 */
export function stopCacheKeepalive(): void {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}
