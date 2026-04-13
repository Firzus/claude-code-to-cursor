/**
 * Cache keepalive: sends a lightweight ping every ~4 minutes to keep
 * Anthropic's prompt cache warm. The ephemeral cache TTL is 5 minutes,
 * so pinging at 4-minute intervals prevents expiry between conversations.
 *
 * Inspired by Aider's --cache-keepalive-pings feature.
 *
 * The ping reuses the last seen tools + system prompt (the cacheable prefix)
 * with a trivial user message and max_tokens=1 so the response is minimal.
 */

import {
  ANTHROPIC_API_URL,
  CLAUDE_CODE_BETA_HEADERS,
  CLAUDE_CODE_USER_AGENT,
} from "./config";
import { getValidToken } from "./oauth";
import { logger } from "./logger";
import type { AnthropicRequest, ContentBlock, Tool } from "./types";

const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

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
  const system = Array.isArray(prepared.system)
    ? (prepared.system as ContentBlock[])
    : [];
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
  if (!lastPrefix) return;

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

  try {
    const response = await fetch(`${ANTHROPIC_API_URL}/v1/messages?beta=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "anthropic-beta": CLAUDE_CODE_BETA_HEADERS,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "User-Agent": CLAUDE_CODE_USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      // Consume the body to prevent resource leaks
      await response.text();
      logger.info("[Cache Keepalive] Ping sent successfully");
    } else {
      // Don't log 429s as errors — we just skip the ping
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
 * Start the keepalive timer. Safe to call multiple times (restarts the timer).
 */
export function startCacheKeepalive(): void {
  if (keepaliveTimer) clearInterval(keepaliveTimer);

  keepaliveTimer = setInterval(() => {
    sendKeepalivePing();
  }, KEEPALIVE_INTERVAL_MS);

  console.log(`✓ Cache keepalive enabled (every ${KEEPALIVE_INTERVAL_MS / 1000}s)`);
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
