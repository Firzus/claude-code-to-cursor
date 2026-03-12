import {
  ANTHROPIC_API_URL,
  CLAUDE_CODE_BETA_HEADERS,
  CLAUDE_CODE_SYSTEM_PROMPT,
  CLAUDE_CODE_EXTRA_INSTRUCTION,
  CLAUDE_CODE_USER_AGENT,
} from "./config";
import { getValidToken, clearCachedToken } from "./oauth";
import { recordRequest } from "./db";
import type { AnthropicRequest, AnthropicError, ContentBlock } from "./types";
import { logger } from "./logger";

type RequestResult =
  | { success: true; response: Response; source: "claude_code" }
  | { success: false; error: string };

let rateLimitCache: { resetAt: number } | null = null;

function isRateLimited(): boolean {
  if (!rateLimitCache) return false;
  if (Date.now() >= rateLimitCache.resetAt) {
    rateLimitCache = null;
    return false;
  }
  return true;
}

function cacheRateLimit(resetAt: number) {
  rateLimitCache = { resetAt };
}

function getRateLimitResetMinutes(): number | null {
  if (!rateLimitCache) return null;
  const diff = rateLimitCache.resetAt - Date.now();
  return Math.ceil(diff / 1000 / 60);
}

/**
 * Prepares the request body for Claude Code:
 * 1. Adds required system prompt prefix for Claude Code identification
 * 2. Adds optional extra instruction (headless mode)
 * 3. Strips TTL from cache_control objects
 */
function prepareClaudeCodeBody(body: AnthropicRequest): AnthropicRequest {
  const prepared = { ...body };

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
      if (prepared.max_tokens < budgetTokens + 4096) {
        prepared.max_tokens = budgetTokens + 16384;
      }
      logger.verbose(`   [Debug] Converted reasoning_budget (${val}) → thinking.budget_tokens=${budgetTokens}`);
    }
    delete prepared.reasoning_budget;
  }

  // Prefix tool names with mcp_ for Claude Code API compatibility
  const TOOL_PREFIX = "mcp_";
  if (prepared.tools && Array.isArray(prepared.tools)) {
    prepared.tools = prepared.tools.map((tool: any) => ({
      ...tool,
      name: tool.name ? `${TOOL_PREFIX}${tool.name}` : tool.name,
    }));
    logger.verbose(
      `   [Debug] Passing ${prepared.tools.length} tools to Claude Code API (prefixed with mcp_)`
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

  prepared.system = systemPrompts;

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

  return prepared;
}

async function makeClaudeCodeRequest(
  endpoint: string,
  body: AnthropicRequest,
  headers: Record<string, string>
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

    // Verify reasoning_budget was removed
    if ("reasoning_budget" in preparedBody) {
      logger.verbose(
        `   [WARN] reasoning_budget still present after prepareClaudeCodeBody! Removing now.`
      );
      delete preparedBody.reasoning_budget;
    }

    // Debug: log the model name being sent
    logger.verbose(
      `   [Debug] Sending model to Claude Code: "${preparedBody.model}"`
    );
    logger.verbose(
      `   [Debug] Request body keys: ${Object.keys(preparedBody).join(", ")}`
    );

    // Use ONLY our Claude Code beta headers - don't merge with Cursor's
    // Cursor may send incompatible headers like "context-1m-2025-08-07"
    console.log(
      `   [Debug] Using Claude Code beta headers: "${CLAUDE_CODE_BETA_HEADERS}"`
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

    if (response.status === 429) {
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

      // If the error is related to tools, retry without tools
      const isToolError =
        errorMessage.includes("tool") ||
        errorMessage.includes("tools") ||
        errorMessage.includes("tool_choice") ||
        errorMessage.includes("input_schema");

      if (isToolError && preparedBody.tools) {
        console.log(
          `   [Debug] Claude Code rejected tools (${errorMessage}), retrying without tools...`
        );
        delete preparedBody.tools;
        delete preparedBody.tool_choice;

        const retryResponse = await fetch(`${ANTHROPIC_API_URL}${endpoint}?beta=true`, {
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

        if (retryResponse.ok || (retryResponse.status !== 400 && retryResponse.status !== 401 && retryResponse.status !== 403)) {
          console.log(`   [Debug] Retry without tools succeeded (status: ${retryResponse.status})`);
          return { success: true, response: stripMcpPrefixFromResponse(retryResponse), source: "claude_code" };
        }

        console.log(`   [Debug] Retry without tools also failed (status: ${retryResponse.status})`);
      }

      console.log("Claude Code 400 error:", JSON.stringify(errorBody));
      return {
        success: false,
        error: errorMessage || "Bad request",
      };
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
  // For streaming, we can't easily extract usage without consuming the stream
  // Record with zeros and let the client track actual usage
  if (stream) {
    recordRequest({
      model,
      source: "claude_code",
      inputTokens: 0,
      outputTokens: 0,
      stream: true,
      latencyMs: Date.now() - startTime,
    });
    return response;
  }

  // For non-streaming, clone and parse the response to get usage
  try {
    const cloned = response.clone();
    const data = (await cloned.json()) as {
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const usage = data.usage || {};

    recordRequest({
      model,
      source: "claude_code",
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
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
  body: AnthropicRequest,
  headers: Record<string, string>
): Promise<Response> {
  const startTime = Date.now();
  const model = body.model;
  const stream = body.stream || false;

  const result = await makeClaudeCodeRequest(endpoint, body, headers);

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

  logger.debug(
    `   [Debug] Error response: ${JSON.stringify({
      type: "error",
      error: {
        type: isClientError ? "invalid_request_error" : "api_error",
        message: result.error,
      },
    })}`
  );

  return new Response(
    JSON.stringify({
      type: "error",
      error: {
        type: isClientError ? "invalid_request_error" : "api_error",
        message: result.error,
      },
    } satisfies AnthropicError),
    {
      status: isClientError ? 400 : 502,
      headers: { "Content-Type": "application/json" },
    }
  );
}
