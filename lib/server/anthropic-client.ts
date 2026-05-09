import {
  ANTHROPIC_API_URL,
  CLAUDE_CODE_BETA_HEADERS,
  CLAUDE_CODE_SYSTEM_PROMPT,
  CLAUDE_CODE_USER_AGENT,
  getConfig,
} from "./config";
import { recordRequest } from "./db";
import { parseResponseError, toErrorMessage } from "./error-utils";
import { logger } from "./logger";
import { getSuggestedMaxTokens, isValidThinkingEffort } from "./model-settings";
import { clearCachedToken, getValidToken } from "./oauth";
import { parseRateLimitHeaders, saveSnapshot } from "./plan-usage-snapshot";
import {
  ensureTrailingUserMessage,
  normalizeAnthropicToolIds,
  TOOL_PREFIX,
} from "./request-normalization";
import { createSemaphore } from "./semaphore";
import { trimToolResult } from "./tool-result-trimmer";
import type { AnthropicError, AnthropicRequest, ContentBlock } from "./types";

// Cap concurrent in-flight upstream calls so heavy CPU work
// (prepareClaudeCodeBody + JSON.stringify of large bodies) doesn't pile up
// on the event loop and stall other in-flight streams. See CCTC_MAX_UPSTREAM_CONCURRENCY.
const upstreamSemaphore = createSemaphore(getConfig().maxUpstreamConcurrency);

/** @internal for tests */
export function getUpstreamSemaphoreState(): { active: number; pending: number } {
  return { active: upstreamSemaphore.active(), pending: upstreamSemaphore.pending() };
}

type RequestResult =
  | { success: true; response: Response; source: "claude_code" }
  | { success: false; error: string; clientError?: boolean };

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
      logger.info("Rate limit soft expiry: allowing probe request");
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
    logger.warn(`Rate limit cached for ${cappedMin}m (API said ${originalMin}m, capped)`);
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
function convertReasoningBudget(prepared: AnthropicRequest): void {
  if (!("reasoning_budget" in prepared)) return;
  if (!prepared.thinking) {
    const val = prepared.reasoning_budget;
    const effort = isValidThinkingEffort(val) ? val : "medium";
    prepared.thinking = { type: "adaptive" };
    prepared.output_config = { effort };
    prepared.temperature = 1;
    const suggested = getSuggestedMaxTokens(effort);
    if (prepared.max_tokens < suggested) {
      prepared.max_tokens = suggested;
    }
    logger.verbose(
      `[ClaudeCode] reasoning_budget=${val} → output_config.effort=${effort}`,
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
      const lastTool = prepared.tools[lastIdx];
      if (lastTool) {
        prepared.tools[lastIdx] = { ...lastTool, cache_control: { type: "ephemeral" } };
      }
    }
    logger.verbose(
      `[ClaudeCode] ${prepared.tools.length} tools (sorted, prefixed with ${TOOL_PREFIX}, last cached)`,
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

function systemToBlocks(existing: AnthropicRequest["system"]): ContentBlock[] {
  if (!existing) return [];
  if (typeof existing === "string") return [{ type: "text", text: existing }];
  return Array.isArray(existing) ? existing : [];
}

function totalTextChars(blocks: ContentBlock[]): number {
  return blocks.reduce(
    (n, b) => n + (b.type === "text" && typeof b.text === "string" ? b.text.length : 0),
    0,
  );
}

/**
 * The first system block must equal CLAUDE_CODE_SYSTEM_PROMPT verbatim;
 * otherwise the OAuth token is rejected with "OAuth not authorized".
 */
function buildSystemPrompt(existing: AnthropicRequest["system"]): ContentBlock[] {
  const systemPrompts: ContentBlock[] = [
    { type: "text", text: CLAUDE_CODE_SYSTEM_PROMPT },
    ...systemToBlocks(existing),
  ];

  const lastIdx = systemPrompts.length - 1;
  const lastBlock = systemPrompts[lastIdx];
  if (lastBlock) {
    systemPrompts[lastIdx] = { ...lastBlock, cache_control: { type: "ephemeral" } };
  }
  return systemPrompts;
}

function applyCacheBreakpoints(messages: AnthropicRequest["messages"]): void {
  if (!Array.isArray(messages)) return;

  const addBreakpoint = (idx: number) => {
    const msg = messages[idx];
    if (!msg) return;
    if (typeof msg.content === "string") {
      messages[idx] = {
        role: msg.role,
        content: [
          { type: "text" as const, text: msg.content, cache_control: { type: "ephemeral" } },
        ],
      };
    } else if (Array.isArray(msg.content) && msg.content.length > 0) {
      const blocks = [...msg.content];
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock) {
        blocks[blocks.length - 1] = { ...lastBlock, cache_control: { type: "ephemeral" } };
      }
      messages[idx] = { role: msg.role, content: blocks };
    }
  };

  const userMsgIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "user") userMsgIndices.push(i);
  }

  // Anthropic allows max 4 cache_control blocks per request.
  // System (1) + tools (1) consume 2, leaving 2 for messages.
  // Priority: second-to-last user msg (recent stable), then first user msg (conversation start).
  if (userMsgIndices.length >= 2) {
    const secondToLast = userMsgIndices[userMsgIndices.length - 2];
    if (secondToLast !== undefined) addBreakpoint(secondToLast);
  }

  if (userMsgIndices.length >= 3) {
    const firstIdx = userMsgIndices[0];
    if (firstIdx !== undefined && firstIdx !== userMsgIndices[userMsgIndices.length - 2]) {
      addBreakpoint(firstIdx);
    }
  }
}

function trimMessageToolResults(messages: AnthropicRequest["messages"]): void {
  if (!Array.isArray(messages)) return;
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (let i = 0; i < msg.content.length; i++) {
      const block = msg.content[i];
      if (block && block.type === "tool_result" && typeof block.content === "string") {
        msg.content[i] = { ...block, content: trimToolResult(block.content) };
      }
    }
  }
}

// Legacy chat-transcript turn marker — Claude leaks it as text in long,
// tool-heavy conversations (e.g. "Human: continue" tail in Cursor /multitask).
export const TURN_MARKER = "Human:";

// Variants seen in the wild include single-newline and bare-prefix leaks; the
// bare-marker false-positive surface (training-data dumps, dialogue scripts)
// doesn't appear in coding workflows. Stream-handler also strips client-side.
const TURN_MARKER_STOP_SEQUENCES = [`\n\n${TURN_MARKER}`, `\n${TURN_MARKER}`, TURN_MARKER] as const;
const MAX_STOP_SEQUENCES = 4; // Anthropic Messages API limit

function injectTurnMarkerStopSequences(prepared: AnthropicRequest): void {
  const merged = new Set<string>(prepared.stop_sequences ?? []);
  for (const seq of TURN_MARKER_STOP_SEQUENCES) merged.add(seq);
  prepared.stop_sequences = [...merged].slice(0, MAX_STOP_SEQUENCES);
}

function prepareClaudeCodeBody(body: AnthropicRequest): AnthropicRequest {
  let prepared = { ...body };

  convertReasoningBudget(prepared);
  prefixToolNames(prepared);
  injectTurnMarkerStopSequences(prepared);

  const systemPrompts = buildSystemPrompt(prepared.system);
  prepared.system = systemPrompts;

  trimMessageToolResults(prepared.messages);
  applyCacheBreakpoints(prepared.messages);

  logger.verbose(
    `[System Prompt] ${systemPrompts.length} blocks, ${totalTextChars(systemPrompts)} chars`,
  );

  prepared = normalizeAnthropicToolIds(prepared);
  prepared = ensureTrailingUserMessage(prepared);

  return prepared;
}

function handle429(response: Response, isProbe: boolean): { resetInfo: string } {
  const retryAfter = response.headers.get("retry-after");
  const rateLimitReset = response.headers.get("x-ratelimit-reset");

  let resetInfo = "";
  let resetAt: number | null = null;

  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds)) {
      resetAt = Date.now() + seconds * 1000;
      resetInfo = ` (resets in ${Math.ceil(seconds / 60)}m)`;
    }
  } else if (rateLimitReset) {
    const resetTime = new Date(rateLimitReset);
    if (!Number.isNaN(resetTime.getTime())) {
      resetAt = resetTime.getTime();
      resetInfo = ` (resets in ${Math.ceil((resetAt - Date.now()) / 1000 / 60)}m)`;
    }
  }

  if (resetAt) {
    cacheRateLimit(resetAt);
  } else if (isProbe) {
    finalizeRateLimitProbe("retry");
  }

  return { resetInfo };
}

/**
 * Anthropic returns "You're out of extra usage" with type=invalid_request_error
 * even when the user's plan quota is not exhausted. On Pro/Max plans, when
 * Extra Usage is disabled (or its balance hits 0), Anthropic routes a fraction
 * of requests — see anthropic-ratelimit-unified-fallback-percentage — to
 * overage billing and rejects them on the spot, regardless of remaining plan
 * quota. Confirmed by anthropics/claude-code#28096 and #28450.
 *
 * The verbatim upstream wording confuses users who still have plan quota
 * available, so we rewrite it with the actual cause and the concrete fix.
 */
const OVERAGE_REJECTED_MARKER = "out of extra usage";
const OVERAGE_REJECTED_MESSAGE =
  "Anthropic routed this request to overage billing (Extra Usage), which is disabled or empty on your account. Your plan quota may still have room — this is Anthropic-side behaviour, not a proxy bug. Fix: enable Extra Usage with a small cap at https://claude.ai/settings/usage. Refs: github.com/anthropics/claude-code/issues/28096, /28450.";

async function handle400(response: Response): Promise<RequestResult> {
  const errorBody = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { error?: { message?: string } };
  const errorMessage = errorBody?.error?.message || "";

  if (errorMessage.includes("only authorized for use with Claude Code")) {
    logger.error("OAuth token not authorized for direct API use");
    return { success: false, error: "OAuth not authorized for API", clientError: true };
  }

  if (errorMessage.includes(OVERAGE_REJECTED_MARKER)) {
    logger.error(`Claude Code 400 (overage rejected): ${JSON.stringify(errorBody)}`);
    return { success: false, error: OVERAGE_REJECTED_MESSAGE, clientError: true };
  }

  logger.error(`Claude Code 400 error: ${JSON.stringify(errorBody)}`);
  return { success: false, error: errorMessage || "Bad request", clientError: true };
}

async function handleNonOkStatus(response: Response): Promise<RequestResult> {
  const { message } = await parseResponseError(response);
  logger.error(`Claude Code ${response.status} error: ${message}`);
  return { success: false, error: message };
}

async function handleErrorStatus(
  response: Response,
  isProbe: boolean,
): Promise<RequestResult | null> {
  if (response.status === 429) {
    const errorBody429 = await response
      .clone()
      .text()
      .catch(() => "");
    logger.warn(`Claude Code 429 response body: ${errorBody429.substring(0, 500)}`);
    const { resetInfo } = handle429(response, isProbe);
    logger.warn(`Claude Code rate limited${resetInfo}`);
    return { success: false, error: `Rate limited${resetInfo}` };
  }

  if (response.status === 401) {
    if (isProbe) finalizeRateLimitProbe("retry");
    logger.warn("OAuth token expired or invalid, clearing cache");
    clearCachedToken();
    return { success: false, error: "OAuth token invalid — visit /login to re-authenticate" };
  }

  if (response.status === 403) {
    if (isProbe) finalizeRateLimitProbe("retry");
    const errorBody = await response.clone().text();
    logger.error(`Claude Code 403 error: ${errorBody}`);
    return { success: false, error: "Permission denied" };
  }

  if (response.status === 400) {
    if (isProbe) finalizeRateLimitProbe("retry");
    return handle400(response);
  }

  if (!response.ok) {
    if (isProbe) finalizeRateLimitProbe("retry");
    return handleNonOkStatus(response);
  }

  return null;
}

async function makeClaudeCodeRequest(
  endpoint: string,
  body: AnthropicRequest,
): Promise<RequestResult> {
  const { limited, isProbe } = checkRateLimit();
  if (limited) {
    const minutes = getRateLimitResetMinutes();
    logger.warn(`Claude Code rate limited (cached), skipping request (resets in ${minutes}m)`);
    return { success: false, error: `Rate limited (cached, resets in ${minutes}m)` };
  }

  const token = await getValidToken();
  if (!token) {
    if (isProbe) finalizeRateLimitProbe("retry");
    return { success: false, error: "No valid OAuth token — visit /login to authenticate" };
  }

  // Acquire BEFORE prepareClaudeCodeBody — the JSON.stringify of large bodies
  // is the dominant CPU spike that stalls in-flight streams. Released once
  // headers are back; per-chunk SSE rewriting is naturally interleaved with
  // network reads and not a sustained burst.
  const release = await upstreamSemaphore.acquire();

  try {
    const preparedBody = prepareClaudeCodeBody(body);

    logger.verbose(
      `[ClaudeCode] model="${preparedBody.model}" keys=${Object.keys(preparedBody).join(",")}`,
    );

    const response = await fetch(`${ANTHROPIC_API_URL}${endpoint}?beta=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "anthropic-beta": CLAUDE_CODE_BETA_HEADERS,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "User-Agent": CLAUDE_CODE_USER_AGENT,
      },
      body: JSON.stringify(preparedBody),
    });

    // Capture the unified rate-limit headers on every response (200 + 4xx).
    // This is the source of truth for /api/plan-usage — Anthropic exposes
    // the same metrics it uses for Claude.ai and the Claude Code CLI.
    try {
      const snapshot = parseRateLimitHeaders(response.headers);
      if (snapshot) saveSnapshot(snapshot);
    } catch (err) {
      logger.verbose(`[plan-usage] header capture failed: ${toErrorMessage(err)}`);
    }

    logger.verbose(`[ClaudeCode] Response status: ${response.status}`);

    const errorResult = await handleErrorStatus(response, isProbe);
    if (errorResult) return errorResult;

    if (isProbe) {
      logger.info("Rate limit probe succeeded, clearing cache");
      finalizeRateLimitProbe("cleared");
    }

    return { success: true, response, source: "claude_code" };
  } catch (error) {
    if (isProbe) finalizeRateLimitProbe("retry");
    const errMsg = toErrorMessage(error);
    logger.error(`Claude Code OAuth request failed: ${errMsg}`);
    return { success: false, error: errMsg };
  } finally {
    release();
  }
}

export async function proxyRequest(endpoint: string, body: AnthropicRequest): Promise<Response> {
  const model = body.model;
  const stream = body.stream || false;

  const result = await makeClaudeCodeRequest(endpoint, body);

  if (result.success) {
    logger.info("Request served via Claude Code");
    return result.response;
  }

  // Claude Code failed - return the error directly. `clientError` is set
  // explicitly on the failure path; we no longer string-match the error
  // message to decide between 400 and 502.
  const isClientError = result.clientError === true;

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

  logger.debug(`[ClaudeCode] Error response: ${JSON.stringify(errorBody)}`);

  return new Response(JSON.stringify(errorBody), {
    status: isClientError ? 400 : 502,
    headers: { "Content-Type": "application/json" },
  });
}
