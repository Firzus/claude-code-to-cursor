import {
  ANTHROPIC_API_URL,
  CLAUDE_CODE_BETA_HEADERS,
  CLAUDE_CODE_SYSTEM_PROMPT,
  CLAUDE_CODE_EXTRA_INSTRUCTION,
  CLAUDE_CODE_USER_AGENT,
} from "./config";
import { getValidToken, clearCachedToken } from "./oauth";
import { recordRequest } from "./db";
import { normalizeAnthropicToolIds } from "./request-normalization";
import { THINKING_MAX_TOKENS_PADDING } from "./model-settings";
import type { AnthropicRequest, AnthropicError, ContentBlock } from "./types";
import { logger } from "./logger";

type RequestResult =
  | { success: true; response: Response; source: "claude_code" }
  | { success: false; error: string };

// Rate limit cache with soft expiry and max cap
const RATE_LIMIT_MAX_CACHE_MS = 900_000; // 15 min
const RATE_LIMIT_SOFT_MS = 300_000; // 5 min

let rateLimitCache: {
  resetAt: number;         // capped reset time
  originalResetAt: number; // what the API actually said
  cachedAt: number;        // when we cached it
  probeInFlight: boolean;  // prevent concurrent probes during soft expiry
} | null = null;

function isRateLimited(): boolean {
  if (!rateLimitCache) return false;
  const now = Date.now();

  // Cache expired → clear
  if (now >= rateLimitCache.resetAt) {
    rateLimitCache = null;
    return false;
  }

  // Soft expiry reached → allow one probe request at a time
  if (now >= rateLimitCache.cachedAt + RATE_LIMIT_SOFT_MS) {
    if (!rateLimitCache.probeInFlight) {
      rateLimitCache.probeInFlight = true;
      console.log("Rate limit soft expiry: allowing probe request");
      return false;
    }
    // Another probe already in flight, still block
    return true;
  }

  // Hard block period
  return true;
}

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
  if (!rateLimitCache) {
    return {
      isLimited: false, resetAt: null, originalResetAt: null,
      minutesRemaining: null, inSoftExpiry: false, cachedAt: null
    };
  }
  const now = Date.now();
  if (now >= rateLimitCache.resetAt) {
    rateLimitCache = null;
    return {
      isLimited: false, resetAt: null, originalResetAt: null,
      minutesRemaining: null, inSoftExpiry: false, cachedAt: null
    };
  }
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
function prepareClaudeCodeBody(body: AnthropicRequest): AnthropicRequest {
  let prepared = { ...body };

  // Convert reasoning_budget to thinking parameter if not already converted
  if ("reasoning_budget" in prepared) {
    if (!prepared.thinking) {
      const budgetMap: Record<string, number> = { high: 16384, medium: 8192, low: 4096 };
      const val = prepared.reasoning_budget;
      const budgetTokens = typeof val === "string"
        ? budgetMap[val] || 8192
        : Number(val) || 8192;
      prepared.thinking = { type: "enabled", budget_tokens: budgetTokens };
      prepared.temperature = 1;
      if (prepared.max_tokens < budgetTokens + THINKING_MAX_TOKENS_PADDING) {
        prepared.max_tokens = budgetTokens + THINKING_MAX_TOKENS_PADDING;
      }
      logger.verbose(`   [Debug] Converted reasoning_budget (${val}) → thinking.budget_tokens=${budgetTokens}`);
    }
    delete prepared.reasoning_budget;
  }

  // Sort tools by name for stable cache keys, then prefix with mcp_
  const TOOL_PREFIX = "mcp_";
  if (prepared.tools && Array.isArray(prepared.tools)) {
    // Stable sort ensures consistent ordering across requests for cache efficiency
    prepared.tools = [...prepared.tools].sort((a: any, b: any) =>
      ((a.name as string) || '').localeCompare((b.name as string) || '')
    );
    prepared.tools = prepared.tools.map((tool: any) => ({
      ...tool,
      name: tool.name ? `${TOOL_PREFIX}${tool.name}` : tool.name,
    }));
    // Add cache breakpoint on the last tool definition (first level of cache hierarchy)
    if (prepared.tools.length > 0) {
      const lastIdx = prepared.tools.length - 1;
      const lastTool = prepared.tools[lastIdx]!;
      prepared.tools[lastIdx] = { ...lastTool, cache_control: { type: "ephemeral" } };
    }
    logger.verbose(
      `   [Debug] Passing ${prepared.tools.length} tools to Claude Code API (sorted, prefixed with mcp_, last cached)`
    );
  }
  if (prepared.tool_choice) {
    // Prefix tool name in tool_choice if it's a specific tool
    if (prepared.tool_choice.type === "tool" && prepared.tool_choice.name) {
      prepared.tool_choice = {
        ...prepared.tool_choice,
        name: `${TOOL_PREFIX}${prepared.tool_choice.name}`,
      };
    }
    logger.verbose(
      `   [Debug] Passing tool_choice to Claude Code API: ${JSON.stringify(prepared.tool_choice)}`
    );
  }

  // Prefix tool names in messages (tool_use and tool_result blocks)
  if (prepared.messages && Array.isArray(prepared.messages)) {
    prepared.messages = prepared.messages.map((msg: any) => {
      if (msg.content && Array.isArray(msg.content)) {
        msg = {
          ...msg,
          content: msg.content.map((block: any) => {
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

  // Build system prompts array - required Claude Code prompt first
  const systemPrompts: ContentBlock[] = [
    { type: "text", text: CLAUDE_CODE_SYSTEM_PROMPT },
  ];

  // Add extra instruction if configured
  if (CLAUDE_CODE_EXTRA_INSTRUCTION) {
    systemPrompts.push({ type: "text", text: CLAUDE_CODE_EXTRA_INSTRUCTION });
  }

  // Merge with existing system prompt
  if (prepared.system) {
    if (typeof prepared.system === "string") {
      systemPrompts.push({ type: "text", text: prepared.system });
    } else if (Array.isArray(prepared.system)) {
      systemPrompts.push(...prepared.system);
    }
  }

  // Add cache_control breakpoint on the last system block to enable prompt caching
  if (systemPrompts.length > 0) {
    const lastIdx = systemPrompts.length - 1;
    const lastBlock = systemPrompts[lastIdx]!;
    systemPrompts[lastIdx] = { ...lastBlock, cache_control: { type: "ephemeral" } };
  }

  prepared.system = systemPrompts;

  // Cache breakpoints on conversation history.
  // Anthropic allows up to 4 breakpoints total. We use:
  //   #1 = last tool definition (set above)
  //   #2 = last system block (set above)
  //   #3 = intermediate message breakpoint (for long conversations, prevents
  //         the 20-block lookback window from missing the prefix cache)
  //   #4 = second-to-last user message (recent conversation cache)
  if (prepared.messages && Array.isArray(prepared.messages)) {
    const addCacheBreakpoint = (idx: number) => {
      const msg = prepared.messages[idx]!;
      if (typeof msg.content === "string") {
        prepared.messages[idx] = {
          role: msg.role,
          content: [{ type: "text" as const, text: msg.content, cache_control: { type: "ephemeral" } }],
        };
      } else if (Array.isArray(msg.content) && msg.content.length > 0) {
        const blocks = [...msg.content];
        const lastBlock = blocks[blocks.length - 1]!;
        blocks[blocks.length - 1] = { ...lastBlock, cache_control: { type: "ephemeral" } };
        prepared.messages[idx] = { role: msg.role, content: blocks };
      }
    };

    const userMsgIndices: number[] = [];
    for (let i = 0; i < prepared.messages.length; i++) {
      if (prepared.messages[i]!.role === "user") userMsgIndices.push(i);
    }

    // Breakpoint #4: second-to-last user message (recent conversation prefix)
    if (userMsgIndices.length >= 2) {
      addCacheBreakpoint(userMsgIndices[userMsgIndices.length - 2]!);
    }

    // Breakpoint #3: intermediate breakpoint for long conversations
    // Place at ~40% of user messages to create two cache tiers
    if (userMsgIndices.length >= 6) {
      const intermediatePos = Math.floor(userMsgIndices.length * 0.4);
      const intermediateIdx = userMsgIndices[intermediatePos]!;
      // Only add if it's different from breakpoint #4
      if (intermediateIdx !== userMsgIndices[userMsgIndices.length - 2]) {
        addCacheBreakpoint(intermediateIdx);
      }
    }
  }

  // Log the final system prompt that will be sent to Claude Code (verbose to file)
  const finalSystemContent = systemPrompts
    .map((block) =>
      block.type === "text" ? block.text : JSON.stringify(block)
    )
    .join("\n\n");
  logger.verbose(
    `\n📋 [Final Claude Code System Prompt] (${finalSystemContent.length} chars):`
  );
  logger.verbose(
    finalSystemContent
      .split("\n")
      .map((l: string) => `   ${l}`)
      .join("\n")
  );

  // Strip TTL from cache_control objects (Claude Code doesn't support it)
  const stripTtl = (content: ContentBlock[] | undefined) => {
    if (!Array.isArray(content)) return;
    for (const item of content) {
      if (item && typeof item === "object" && "cache_control" in item) {
        const cc = item.cache_control as Record<string, unknown>;
        if (cc && "ttl" in cc) {
          delete cc.ttl;
        }
      }
    }
  };

  // Strip TTL from system
  if (Array.isArray(prepared.system)) {
    stripTtl(prepared.system as ContentBlock[]);
  }

  // Strip TTL from messages
  if (Array.isArray(prepared.messages)) {
    for (const message of prepared.messages) {
      if (Array.isArray(message.content)) {
        stripTtl(message.content);
      }
    }
  }

  prepared = normalizeAnthropicToolIds(prepared);

  return prepared;
}

async function makeClaudeCodeRequest(
  endpoint: string,
  body: AnthropicRequest
): Promise<RequestResult> {
  if (isRateLimited()) {
    const minutes = getRateLimitResetMinutes();
    console.log(
      `Claude Code rate limited (cached), skipping request (resets in ${minutes}m)`
    );
    return {
      success: false,
      error: `Rate limited (cached, resets in ${minutes}m)`,
    };
  }

  const token = await getValidToken();
  if (!token) {
    return {
      success: false,
      error: "No valid OAuth token — visit /login to authenticate",
    };
  }

  try {
    // Prepare the body with required Claude Code modifications
    const preparedBody = prepareClaudeCodeBody(body);

    // Debug: log the model name being sent
    logger.verbose(
      `   [Debug] Sending model to Claude Code: "${preparedBody.model}"`
    );
    logger.verbose(
      `   [Debug] Request body keys: ${Object.keys(preparedBody).join(", ")}`
    );

    // Use ONLY our Claude Code beta headers - don't merge with Cursor's
    console.log(
      `   [Debug] Using Claude Code beta headers: "${CLAUDE_CODE_BETA_HEADERS}"`
    );

    const requestHeaders = {
      Authorization: `Bearer ${token.accessToken}`,
      "anthropic-beta": CLAUDE_CODE_BETA_HEADERS,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "User-Agent": CLAUDE_CODE_USER_AGENT,
    };
    const apiUrl = `${ANTHROPIC_API_URL}${endpoint}?beta=true`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(preparedBody),
    });

    console.log(`   [Debug] Anthropic API response status: ${response.status}`);

    if (response.status === 429) {
      const errorBody429 = await response.clone().text().catch(() => "");
      console.log(`Claude Code 429 response body: ${errorBody429.substring(0, 500)}`);
      const retryAfter = response.headers.get("retry-after");
      const rateLimitReset = response.headers.get("x-ratelimit-reset");

      let resetInfo = "";
      let resetAt: number | null = null;

      if (retryAfter) {
        const seconds = parseInt(retryAfter);
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
        cacheRateLimit(resetAt);
      }

      console.log(`Claude Code rate limited${resetInfo}`);
      return { success: false, error: `Rate limited${resetInfo}` };
    }

    if (response.status === 401) {
      console.log("OAuth token expired or invalid, clearing cache");
      clearCachedToken();
      return {
        success: false,
        error: "OAuth token invalid — visit /login to re-authenticate",
      };
    }

    if (response.status === 403) {
      const errorBody = await response.clone().text();
      console.log("Claude Code 403 error:", errorBody);
      return {
        success: false,
        error: "Permission denied",
      };
    }

    // Check for API errors in the response body (can happen even with 200 status)
    if (response.status === 400) {
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
      const errorBody = await response.clone().text().catch(() => "");
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

    // If we were probing after soft expiry and succeeded, clear the cache
    if (rateLimitCache) {
      console.log("Rate limit probe succeeded, clearing cache");
      rateLimitCache = null;
    }

    // Strip mcp_ prefix from tool names in streaming/non-streaming responses
    const strippedResponse = stripMcpPrefixFromResponse(response);
    return { success: true, response: strippedResponse, source: "claude_code" };
  } catch (error) {
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
  startTime: number
): Promise<Response> {
  // For streaming, token tracking is handled by the stream handler's onComplete callback
  if (stream) {
    return response;
  }

  // For non-streaming, clone and parse the response to get usage
  try {
    const cloned = response.clone();
    const data = (await cloned.json()) as {
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    };
    const usage = data.usage || {};

    recordRequest({
      model,
      source: "claude_code",
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
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
      stream: false,
      latencyMs: Date.now() - startTime,
    });
  }

  return response;
}

export async function proxyRequest(
  endpoint: string,
  body: AnthropicRequest
): Promise<Response> {
  const startTime = Date.now();
  const model = body.model;
  const stream = body.stream || false;

  const result = await makeClaudeCodeRequest(endpoint, body);

  if (result.success) {
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
