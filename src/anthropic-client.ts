import { updateCachePrefix } from "./cache-keepalive";
import {
  ANTHROPIC_API_URL,
  CLAUDE_CODE_SYSTEM_PROMPT,
  CLAUDE_CODE_USER_AGENT,
  getClaudeCodeBetaHeaders,
} from "./config";
import { getModelSettings, recordRequest } from "./db";
import { logger } from "./logger";
import { type CacheTTL, THINKING_MAX_TOKENS_PADDING } from "./model-settings";
import { clearCachedToken, getValidToken } from "./oauth";
import { markSuccessfulProxyActivity } from "./proxy-activity";
import { normalizeAnthropicToolIds } from "./request-normalization";
import type { AnthropicError, AnthropicRequest, ContentBlock } from "./types";

type RequestResult =
  | { success: true; response: Response; source: "claude_code" }
  | { success: false; error: string };

// Rate limit cache with soft expiry and max cap
const RATE_LIMIT_MAX_CACHE_MS = 900_000; // 15 min
const RATE_LIMIT_SOFT_MS = 300_000; // 5 min
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000; // 1 min

let rateLimitCache: {
  resetAt: number; // capped reset time
  originalResetAt: number; // what the API actually said
  cachedAt: number; // when we cached it
  probeInFlight: boolean; // prevent concurrent probes during soft expiry
} | null = null;

let rateLimitCleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Lazy cleanup: clear the cache if its (capped) reset time has passed.
 * Called from every entry point that touches `rateLimitCache` so the
 * in-memory state never outlives its TTL.
 */
function cleanupExpiredRateLimit(): void {
  if (!rateLimitCache) return;
  if (Date.now() >= rateLimitCache.resetAt) {
    rateLimitCache = null;
  }
}

/**
 * Check the rate-limit state and claim a probe slot if we're in the
 * soft-expiry window.
 *
 * The second field `isProbe` is critical for the caller:
 * - `true`  → this request holds the probe slot and MUST finalize it via
 *             `finalizeRateLimitProbe(outcome)` after the upstream call,
 *             otherwise `probeInFlight` stays set forever and subsequent
 *             requests are blocked until the hard TTL elapses.
 * - `false` → either no rate limit, or another probe is already in flight.
 */
function checkRateLimit(): { limited: boolean; isProbe: boolean } {
  cleanupExpiredRateLimit();
  if (!rateLimitCache) return { limited: false, isProbe: false };

  const now = Date.now();

  // Soft expiry reached → allow one probe request at a time
  if (now >= rateLimitCache.cachedAt + RATE_LIMIT_SOFT_MS) {
    if (!rateLimitCache.probeInFlight) {
      rateLimitCache.probeInFlight = true;
      console.log("Rate limit soft expiry: allowing probe request");
      return { limited: false, isProbe: true };
    }
    // Another probe already in flight, still block
    return { limited: true, isProbe: false };
  }

  // Hard block period
  return { limited: true, isProbe: false };
}

/**
 * Release the probe slot after a probe request completes.
 *
 * - `"cleared"`     → probe succeeded, the upstream server is happy;
 *                     tear the whole cache down so the next request is
 *                     unblocked immediately.
 * - `"retry"`       → probe failed for a non-rate-limit reason (network,
 *                     5xx, etc.); just release the flag so another probe
 *                     can try on the next request.
 * - `"rateLimited"` → probe got a fresh 429; `cacheRateLimit()` will
 *                     replace the whole entry so we don't need to touch
 *                     `probeInFlight` here.
 */
function finalizeRateLimitProbe(outcome: "cleared" | "retry" | "rateLimited"): void {
  if (!rateLimitCache) return;
  if (outcome === "cleared") {
    rateLimitCache = null;
    return;
  }
  if (outcome === "retry") {
    rateLimitCache.probeInFlight = false;
  }
  // "rateLimited" is handled upstream by cacheRateLimit() replacing the entry.
}

/**
 * Start a periodic background cleanup so the cache never outlives its TTL
 * even if the server goes idle. Safe to call multiple times — the existing
 * timer is cleared first.
 */
export function startRateLimitCleanup(intervalMs: number = RATE_LIMIT_CLEANUP_INTERVAL_MS): void {
  stopRateLimitCleanup();
  rateLimitCleanupTimer = setInterval(cleanupExpiredRateLimit, intervalMs);
}

/** Stop the periodic cleanup timer (called from the graceful shutdown path). */
export function stopRateLimitCleanup(): void {
  if (rateLimitCleanupTimer) {
    clearInterval(rateLimitCleanupTimer);
    rateLimitCleanupTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Test-only exports (prefixed `__` to discourage production use)
// ---------------------------------------------------------------------------

/** @internal for tests */
export const __testing = {
  checkRateLimit: () => checkRateLimit(),
  finalizeRateLimitProbe: (outcome: "cleared" | "retry" | "rateLimited") =>
    finalizeRateLimitProbe(outcome),
  cacheRateLimit: (resetAt: number) => cacheRateLimit(resetAt),
  cleanupExpiredRateLimit: () => cleanupExpiredRateLimit(),
  getRateLimitCacheState: () => (rateLimitCache ? { ...rateLimitCache } : null),
  setRateLimitCacheState: (
    state: {
      resetAt: number;
      originalResetAt: number;
      cachedAt: number;
      probeInFlight: boolean;
    } | null,
  ) => {
    rateLimitCache = state;
  },
};

function cacheRateLimit(apiResetAt: number) {
  const now = Date.now();
  const maxResetAt = now + RATE_LIMIT_MAX_CACHE_MS;
  rateLimitCache = {
    resetAt: Math.min(apiResetAt, maxResetAt),
    originalResetAt: apiResetAt,
    cachedAt: now,
    probeInFlight: false,
  };
  const cappedMin = Math.ceil((rateLimitCache.resetAt - now) / 60000);
  const originalMin = Math.ceil((apiResetAt - now) / 60000);
  if (cappedMin < originalMin) {
    console.log(`   Rate limit cached for ${cappedMin}m (API said ${originalMin}m, capped)`);
  }
}

function getRateLimitResetMinutes(): number | null {
  if (!rateLimitCache) return null;
  const diff = rateLimitCache.resetAt - Date.now();
  return Math.ceil(diff / 1000 / 60);
}

export function clearRateLimitCache(): { cleared: boolean; wasLimited: boolean } {
  const wasLimited = rateLimitCache !== null;
  rateLimitCache = null;
  return { cleared: true, wasLimited };
}

export function getRateLimitStatus(): {
  isLimited: boolean;
  resetAt: number | null;
  originalResetAt: number | null;
  minutesRemaining: number | null;
  inSoftExpiry: boolean;
  cachedAt: number | null;
} {
  cleanupExpiredRateLimit();
  if (!rateLimitCache) {
    return {
      isLimited: false,
      resetAt: null,
      originalResetAt: null,
      minutesRemaining: null,
      inSoftExpiry: false,
      cachedAt: null,
    };
  }
  const now = Date.now();
  const softExpired = now >= rateLimitCache.cachedAt + RATE_LIMIT_SOFT_MS;
  return {
    isLimited: true,
    resetAt: rateLimitCache.resetAt,
    originalResetAt: rateLimitCache.originalResetAt,
    minutesRemaining: Math.ceil((rateLimitCache.resetAt - now) / 60000),
    inSoftExpiry: softExpired,
    cachedAt: rateLimitCache.cachedAt,
  };
}

/**
 * Prepares the request body for Claude Code:
 * 1. Adds required system prompt prefix for Claude Code identification
 * 2. Adds optional extra instruction (headless mode)
 * 3. Strips TTL from cache_control objects
 */
const TOOL_PREFIX = "mcp_";

function convertReasoningBudget(prepared: AnthropicRequest): void {
  if (!("reasoning_budget" in prepared)) return;
  if (!prepared.thinking) {
    const budgetMap: Record<string, number> = { high: 16384, medium: 8192, low: 4096 };
    const val = prepared.reasoning_budget;
    const budgetTokens = typeof val === "string" ? budgetMap[val] || 8192 : Number(val) || 8192;
    prepared.thinking = { type: "enabled", budget_tokens: budgetTokens };
    prepared.temperature = 1;
    if (prepared.max_tokens < budgetTokens + THINKING_MAX_TOKENS_PADDING) {
      prepared.max_tokens = budgetTokens + THINKING_MAX_TOKENS_PADDING;
    }
    logger.verbose(
      `   [Debug] Converted reasoning_budget (${val}) → thinking.budget_tokens=${budgetTokens}`,
    );
  }
  delete prepared.reasoning_budget;
}

function prefixToolNames(prepared: AnthropicRequest): void {
  if (prepared.tools && Array.isArray(prepared.tools)) {
    prepared.tools = [...prepared.tools].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    prepared.tools = prepared.tools.map((tool) => ({
      ...tool,
      name: tool.name ? `${TOOL_PREFIX}${tool.name}` : tool.name,
    }));
    if (prepared.tools.length > 0) {
      const lastIdx = prepared.tools.length - 1;
      const lastTool = prepared.tools[lastIdx]!;
      prepared.tools[lastIdx] = { ...lastTool, cache_control: { type: "ephemeral" } };
    }
    logger.verbose(
      `   [Debug] Passing ${prepared.tools.length} tools to Claude Code API (sorted, prefixed with mcp_, last cached)`,
    );
  }
  if (prepared.tool_choice?.type === "tool" && prepared.tool_choice.name) {
    prepared.tool_choice = {
      ...prepared.tool_choice,
      name: `${TOOL_PREFIX}${prepared.tool_choice.name}`,
    };
  }

  if (prepared.messages && Array.isArray(prepared.messages)) {
    prepared.messages = prepared.messages.map((msg) => {
      if (msg.content && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((block) => {
            if ((block.type === "tool_use" || block.type === "tool_result") && block.name) {
              return { ...block, name: `${TOOL_PREFIX}${block.name}` };
            }
            return block;
          }),
        };
      }
      return msg;
    });
  }
}

/**
 * Build the final system prompt sent to Anthropic.
 *
 * Anthropic's OAuth-backed Claude Code API requires the FIRST system block
 * to match the exact string `CLAUDE_CODE_SYSTEM_PROMPT` — without it the
 * token is rejected with "OAuth not authorized". That's the only content
 * the proxy adds. Everything else is the upstream client's (Cursor's) own
 * system prompt, passed through verbatim and kept authoritative: it owns
 * the agent identity, tool semantics, and task instructions.
 *
 * No optional "extra instructions" are appended — that codepath was
 * removed to avoid polluting Cursor's prompt with proxy-side identity
 * text that would conflict with Cursor's agent framing.
 */
function buildSystemPrompt(existing: AnthropicRequest["system"]): ContentBlock[] {
  const systemPrompts: ContentBlock[] = [{ type: "text", text: CLAUDE_CODE_SYSTEM_PROMPT }];
  if (existing) {
    if (typeof existing === "string") {
      systemPrompts.push({ type: "text", text: existing });
    } else if (Array.isArray(existing)) {
      systemPrompts.push(...existing);
    }
  }
  if (systemPrompts.length > 0) {
    const lastIdx = systemPrompts.length - 1;
    const lastBlock = systemPrompts[lastIdx]!;
    systemPrompts[lastIdx] = { ...lastBlock, cache_control: { type: "ephemeral" } };
  }
  return systemPrompts;
}

function applyCacheBreakpoints(messages: AnthropicRequest["messages"]): void {
  if (!Array.isArray(messages)) return;

  const addBreakpoint = (idx: number) => {
    const msg = messages[idx]!;
    if (typeof msg.content === "string") {
      messages[idx] = {
        role: msg.role,
        content: [
          { type: "text" as const, text: msg.content, cache_control: { type: "ephemeral" } },
        ],
      };
    } else if (Array.isArray(msg.content) && msg.content.length > 0) {
      const blocks = [...msg.content];
      const lastBlock = blocks[blocks.length - 1]!;
      blocks[blocks.length - 1] = { ...lastBlock, cache_control: { type: "ephemeral" } };
      messages[idx] = { role: msg.role, content: blocks };
    }
  };

  const userMsgIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "user") userMsgIndices.push(i);
  }

  if (userMsgIndices.length >= 2) {
    addBreakpoint(userMsgIndices[userMsgIndices.length - 2]!);
  }

  if (userMsgIndices.length >= 6) {
    const intermediatePos = Math.floor(userMsgIndices.length * 0.4);
    const intermediateIdx = userMsgIndices[intermediatePos]!;
    if (intermediateIdx !== userMsgIndices[userMsgIndices.length - 2]) {
      addBreakpoint(intermediateIdx);
    }
  }
}

/**
 * Normalize every `cache_control` block in the request to match the configured
 * cache TTL.
 *
 * - `"5m"` (default): strip any `ttl` field so Anthropic falls back to the
 *   free 5-minute cache.
 * - `"1h"`: stamp `ttl: "1h"` on every cache_control block so Anthropic uses
 *   the 1-hour cache (2× write cost, requires `extended-cache-ttl-2025-04-11`
 *   beta header).
 *
 * Tools are also checked — they can carry `cache_control` on the last entry
 * (see `prefixToolNames`).
 *
 * Exported for unit tests only.
 */
export function applyCacheTtl(prepared: AnthropicRequest, cacheTTL: CacheTTL): void {
  const applyTo = (content: ContentBlock[] | undefined) => {
    if (!Array.isArray(content)) return;
    for (const item of content) {
      if (item && typeof item === "object" && "cache_control" in item) {
        const cc = item.cache_control as Record<string, unknown> | null | undefined;
        if (!cc) continue;
        if (cacheTTL === "1h") {
          cc.ttl = "1h";
        } else if ("ttl" in cc) {
          delete cc.ttl;
        }
      }
    }
  };

  if (Array.isArray(prepared.system)) {
    applyTo(prepared.system as ContentBlock[]);
  }
  if (Array.isArray(prepared.messages)) {
    for (const message of prepared.messages) {
      if (Array.isArray(message.content)) {
        applyTo(message.content);
      }
    }
  }
  if (Array.isArray(prepared.tools)) {
    // Tools carry cache_control directly on the tool object, not inside a
    // content array, so walk them separately.
    for (const tool of prepared.tools) {
      const cc = (tool as { cache_control?: Record<string, unknown> }).cache_control;
      if (!cc) continue;
      if (cacheTTL === "1h") {
        cc.ttl = "1h";
      } else if ("ttl" in cc) {
        delete cc.ttl;
      }
    }
  }
}

function prepareClaudeCodeBody(body: AnthropicRequest, cacheTTL: CacheTTL): AnthropicRequest {
  let prepared = { ...body };

  convertReasoningBudget(prepared);
  prefixToolNames(prepared);

  const systemPrompts = buildSystemPrompt(prepared.system);
  prepared.system = systemPrompts;

  applyCacheBreakpoints(prepared.messages);

  const finalSystemContent = systemPrompts
    .map((block) => (block.type === "text" ? block.text : JSON.stringify(block)))
    .join("\n\n");
  logger.verbose(`\n📋 [Final Claude Code System Prompt] (${finalSystemContent.length} chars):`);
  logger.verbose(
    finalSystemContent
      .split("\n")
      .map((l: string) => `   ${l}`)
      .join("\n"),
  );

  applyCacheTtl(prepared, cacheTTL);
  prepared = normalizeAnthropicToolIds(prepared);

  return prepared;
}

async function makeClaudeCodeRequest(
  endpoint: string,
  body: AnthropicRequest,
): Promise<RequestResult> {
  const { limited, isProbe } = checkRateLimit();
  if (limited) {
    const minutes = getRateLimitResetMinutes();
    console.log(`Claude Code rate limited (cached), skipping request (resets in ${minutes}m)`);
    return {
      success: false,
      error: `Rate limited (cached, resets in ${minutes}m)`,
    };
  }

  const token = await getValidToken();
  if (!token) {
    // No token means we never made the upstream call — release the probe
    // slot so the next request can try again, otherwise a missing token
    // would deadlock future probes in the soft-expiry window.
    if (isProbe) finalizeRateLimitProbe("retry");
    return {
      success: false,
      error: "No valid OAuth token — visit /login to authenticate",
    };
  }

  try {
    // Read persisted settings once per request so cacheTTL + beta headers stay
    // in sync even if the setting changes mid-session.
    const modelSettings = getModelSettings();

    // Prepare the body with required Claude Code modifications
    const preparedBody = prepareClaudeCodeBody(body, modelSettings.cacheTTL);

    // Debug: log the model name being sent
    logger.verbose(`   [Debug] Sending model to Claude Code: "${preparedBody.model}"`);
    logger.verbose(`   [Debug] Request body keys: ${Object.keys(preparedBody).join(", ")}`);

    // Use ONLY our Claude Code beta headers - don't merge with Cursor's
    const betaHeaders = getClaudeCodeBetaHeaders({
      extendedCacheTtl: modelSettings.cacheTTL === "1h",
    });
    console.log(`   [Debug] Using Claude Code beta headers: "${betaHeaders}"`);

    const requestHeaders = {
      Authorization: `Bearer ${token.accessToken}`,
      "anthropic-beta": betaHeaders,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "User-Agent": CLAUDE_CODE_USER_AGENT,
    };
    const apiUrl = `${ANTHROPIC_API_URL}${endpoint}?beta=true`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(preparedBody),
      signal: AbortSignal.timeout(120_000),
    });

    console.log(`   [Debug] Anthropic API response status: ${response.status}`);

    if (response.status === 429) {
      const errorBody429 = await response
        .clone()
        .text()
        .catch(() => "");
      console.log(`Claude Code 429 response body: ${errorBody429.substring(0, 500)}`);
      const retryAfter = response.headers.get("retry-after");
      const rateLimitReset = response.headers.get("x-ratelimit-reset");

      let resetInfo = "";
      let resetAt: number | null = null;

      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!Number.isNaN(seconds)) {
          resetAt = Date.now() + seconds * 1000;
          const minutes = Math.ceil(seconds / 60);
          resetInfo = ` (resets in ${minutes}m)`;
        }
      } else if (rateLimitReset) {
        const resetTime = new Date(rateLimitReset);
        if (!Number.isNaN(resetTime.getTime())) {
          resetAt = resetTime.getTime();
          const diff = resetAt - Date.now();
          const minutes = Math.ceil(diff / 1000 / 60);
          resetInfo = ` (resets in ${minutes}m)`;
        }
      }

      if (resetAt) {
        // cacheRateLimit() replaces the whole entry; probeInFlight is reset
        // to false as a side-effect so the next probe can fire at soft expiry.
        cacheRateLimit(resetAt);
      } else if (isProbe) {
        // 429 with no resetAt header — nothing to re-cache. Release the probe
        // slot so future requests can retry.
        finalizeRateLimitProbe("retry");
      }

      console.log(`Claude Code rate limited${resetInfo}`);
      return { success: false, error: `Rate limited${resetInfo}` };
    }

    if (response.status === 401) {
      if (isProbe) finalizeRateLimitProbe("retry");
      console.log("OAuth token expired or invalid, clearing cache");
      clearCachedToken();
      return {
        success: false,
        error: "OAuth token invalid — visit /login to re-authenticate",
      };
    }

    if (response.status === 403) {
      if (isProbe) finalizeRateLimitProbe("retry");
      const errorBody = await response.clone().text();
      console.log("Claude Code 403 error:", errorBody);
      return {
        success: false,
        error: "Permission denied",
      };
    }

    // Check for API errors in the response body (can happen even with 200 status)
    if (response.status === 400) {
      if (isProbe) finalizeRateLimitProbe("retry");
      const errorBody = (await response
        .clone()
        .json()
        .catch(() => ({}))) as { error?: { message?: string } };
      const errorMessage = errorBody?.error?.message || "";

      if (errorMessage.includes("only authorized for use with Claude Code")) {
        console.log("OAuth token not authorized for direct API use");
        return {
          success: false,
          error: "OAuth not authorized for API",
        };
      }

      console.log("Claude Code 400 error:", JSON.stringify(errorBody));
      return {
        success: false,
        error: errorMessage || "Bad request",
      };
    }

    // Handle other non-OK status codes (500, 529 overloaded, etc.)
    if (!response.ok) {
      if (isProbe) finalizeRateLimitProbe("retry");
      const errorBody = await response
        .clone()
        .text()
        .catch(() => "");
      console.log(`Claude Code ${response.status} error: ${errorBody.substring(0, 500)}`);

      // For streaming requests, return the response as-is so the stream handler
      // can process SSE error events (Anthropic may return 200 for streaming errors,
      // but non-200 streaming responses should still be passed through)
      if (body.stream) {
        const strippedResponse = stripMcpPrefixFromResponse(response);
        return { success: true, response: strippedResponse, source: "claude_code" };
      }

      let errorMessage = "API error";
      try {
        const parsed = JSON.parse(errorBody) as { error?: { message?: string; type?: string } };
        errorMessage = parsed?.error?.message || `HTTP ${response.status}`;
      } catch {
        errorMessage = `HTTP ${response.status}: ${errorBody.substring(0, 200)}`;
      }
      return { success: false, error: errorMessage };
    }

    // Probe succeeded — tear down the rate-limit cache so the next request
    // goes through normally.
    if (isProbe) {
      console.log("Rate limit probe succeeded, clearing cache");
      finalizeRateLimitProbe("cleared");
    }

    // Update cache keepalive prefix so pings reuse the same tools+system
    updateCachePrefix(preparedBody);

    // Strip mcp_ prefix from tool names in streaming/non-streaming responses
    const strippedResponse = stripMcpPrefixFromResponse(response);
    return { success: true, response: strippedResponse, source: "claude_code" };
  } catch (error) {
    // Network error, timeout, aborted, etc. — never call cacheRateLimit,
    // but we still need to release the probe slot so it doesn't deadlock.
    if (isProbe) finalizeRateLimitProbe("retry");
    console.error("Claude Code OAuth request failed:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Wraps a response to strip the "mcp_" prefix from tool names.
 * This reverses the prefixing done in prepareClaudeCodeBody.
 */
function stripMcpPrefixFromResponse(response: Response): Response {
  if (!response.body) return response;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      let text = decoder.decode(value, { stream: true });
      // Strip mcp_ prefix from tool names in JSON responses
      text = text.replace(/"name"\s*:\s*"mcp_([^"]+)"/g, '"name": "$1"');
      controller.enqueue(encoder.encode(text));
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Extract usage from response (for non-streaming)
 */
async function extractUsageFromResponse(
  response: Response,
  model: string,
  stream: boolean,
  startTime: number,
): Promise<Response> {
  // For streaming, token tracking is handled by the stream handler's onComplete callback
  if (stream) {
    return response;
  }

  // For non-streaming, clone and parse the response to get usage
  try {
    const cloned = response.clone();
    const data = (await cloned.json()) as {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
        thinking_tokens?: number;
      };
    };
    const usage = data.usage || {};

    recordRequest({
      model,
      source: "claude_code",
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
      thinkingTokens: usage.thinking_tokens ?? 0,
      stream: false,
      latencyMs: Date.now() - startTime,
    });
  } catch {
    // If we can't parse, record with zeros
    recordRequest({
      model,
      source: "claude_code",
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      stream: false,
      latencyMs: Date.now() - startTime,
    });
  }

  return response;
}

export async function proxyRequest(endpoint: string, body: AnthropicRequest): Promise<Response> {
  const startTime = Date.now();
  const model = body.model;
  const stream = body.stream || false;

  const result = await makeClaudeCodeRequest(endpoint, body);

  if (result.success) {
    markSuccessfulProxyActivity();
    console.log(`✓ Request served via Claude Code`);
    return extractUsageFromResponse(result.response, model, stream, startTime);
  }

  // Claude Code failed - return the error directly
  const isClientError =
    result.error.includes("too long") ||
    result.error.includes("invalid") ||
    result.error.includes("Bad request");

  recordRequest({
    model,
    source: "error",
    inputTokens: 0,
    outputTokens: 0,
    stream,
    error: result.error,
  });

  const errorBody: AnthropicError = {
    type: "error",
    error: {
      type: isClientError ? "invalid_request_error" : "api_error",
      message: result.error,
    },
  };

  logger.debug(`   [Debug] Error response: ${JSON.stringify(errorBody)}`);

  return new Response(JSON.stringify(errorBody), {
    status: isClientError ? 400 : 502,
    headers: { "Content-Type": "application/json" },
  });
}
