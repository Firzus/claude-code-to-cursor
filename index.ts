import { getConfig, CCPROXY_AUTH_PATH } from "./src/config";
import {
  hasCredentials,
  getValidToken,
  generatePKCE,
  getAuthorizationURL,
  exchangeCode,
} from "./src/oauth";
import { proxyRequest } from "./src/anthropic-client";
import {
  openaiToAnthropic,
  anthropicToOpenai,
  createOpenAIStreamChunk,
  createOpenAIStreamStart,
  createOpenAIStreamUsageChunk,
  createOpenAIToolCallChunk,
  parseXMLToolCalls,
  type OpenAIChatRequest,
} from "./src/openai-adapter";
import {
  isOpenAIPassthroughEnabled,
  proxyOpenAIRequest,
} from "./src/openai-passthrough";
import {
  getDb,
  getAnalytics,
  getBudgetSettings,
  updateBudgetSettings,
  getRecentRequests,
  resetAnalytics,
  type BudgetSettings,
} from "./src/db";
import { formatCost } from "./src/pricing";
import type { AnthropicRequest, AnthropicError } from "./src/types";
import {
  translateToolCalls,
  needsTranslation,
} from "./src/tool-call-translator";
import { logger } from "./src/logger";

const config = getConfig();

function shouldPassthroughToOpenAI(model: string): boolean {
  if (!isOpenAIPassthroughEnabled()) return false;
  const normalized = model.toLowerCase();
  // Pass through non-Claude models (GPT, Gemini, Llama, etc.)
  return !normalized.includes("claude");
}

// PKCE state storage (module-level, TTL 10 min)
const pkceStore = new Map<
  string,
  { codeVerifier: string; createdAt: number }
>();
const PKCE_TTL_MS = 10 * 60 * 1000;

function cleanPkceStore() {
  const now = Date.now();
  for (const [key, val] of pkceStore) {
    if (now - val.createdAt > PKCE_TTL_MS) pkceStore.delete(key);
  }
}

async function checkCredentials(): Promise<boolean> {
  if (!hasCredentials()) {
    console.log("\n⚠️  No OAuth credentials found.");
    console.log(
      `   >>> To authenticate: open http://localhost:${config.port}/login`
    );

    if (config.anthropicApiKey) {
      console.log("✓ Fallback ANTHROPIC_API_KEY is configured");
      return true;
    }

    console.log("⚠️  No ANTHROPIC_API_KEY fallback configured either.");
    return false;
  }

  console.log("✓ OAuth credentials loaded");

  const token = await getValidToken();
  if (token) {
    const expiresIn = Math.round((token.expiresAt - Date.now()) / 1000 / 60);
    console.log(`  Token expires in ${expiresIn} minutes`);
  }

  if (config.anthropicApiKey) {
    console.log("✓ Fallback ANTHROPIC_API_KEY configured");
  } else {
    console.log(
      "⚠️  No fallback ANTHROPIC_API_KEY (will fail if Claude Code limits hit)"
    );
  }

  return true;
}

function logRequestDetails(req: Request, endpoint: string) {
  const url = new URL(req.url);
  const userAgent = req.headers.get("user-agent") || "unknown";
  const origin = req.headers.get("origin") || "none";
  const referer = req.headers.get("referer") || "none";
  const cfRay = req.headers.get("cf-ray") || "none";
  const cfConnectingIp = req.headers.get("cf-connecting-ip") || "none";
  const xForwardedFor = req.headers.get("x-forwarded-for") || "none";
  const xRealIp = req.headers.get("x-real-ip") || "none";

  const anthropicBeta = req.headers.get("anthropic-beta") || "none";

  console.log(`\n📥 [${endpoint}] Request Details:`);
  console.log(`   User-Agent: ${userAgent}`);
  console.log(`   Origin: ${origin}`);
  console.log(`   Referer: ${referer}`);
  console.log(`   CF-Ray: ${cfRay}`);
  console.log(`   CF-Connecting-IP: ${cfConnectingIp} (Cursor backend server)`);
  console.log(`   X-Forwarded-For: ${xForwardedFor}`);
  console.log(`   X-Real-IP: ${xRealIp}`);
  console.log(`   Anthropic-Beta: ${anthropicBeta}`);
  console.log(`   URL: ${url.pathname}${url.search}`);
  console.log(`   Method: ${req.method}`);

  // Log all headers (useful for debugging tunnel issues)
  const allHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    allHeaders[key] = value;
  });
  console.log(`   All Headers: ${JSON.stringify(allHeaders, null, 2)}`);
}

function extractHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const passthrough = ["anthropic-version", "anthropic-beta"];

  for (const key of passthrough) {
    const value = req.headers.get(key);
    if (value) headers[key] = value;
  }

  if (!headers["anthropic-version"]) {
    headers["anthropic-version"] = "2023-06-01";
  }

  return headers;
}

function extractAPIKey(req: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.substring(7).trim();
    // Only use if it looks like an Anthropic API key (starts with sk-ant-)
    if (apiKey.startsWith("sk-ant-")) {
      return apiKey;
    }
  }

  // Check x-api-key header (Anthropic format)
  const apiKeyHeader = req.headers.get("x-api-key");
  if (apiKeyHeader?.startsWith("sk-ant-")) {
    return apiKeyHeader;
  }

  return null;
}

function checkIPWhitelist(req: Request): {
  allowed: boolean;
  ip?: string;
  reason?: string;
} {
  // If whitelist is empty (disabled), allow all requests
  if (config.allowedIPs.length === 0) {
    return { allowed: true, ip: "all" };
  }

  // Only enforce IP whitelist when requests come through tunnel (have CF headers)
  const cfRay = req.headers.get("cf-ray");
  const cfConnectingIp = req.headers.get("cf-connecting-ip");

  // If no CF headers, assume local request (allow)
  if (!cfRay && !cfConnectingIp) {
    return { allowed: true, ip: "local" };
  }

  // If CF headers present, validate IP
  const clientIP =
    cfConnectingIp || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  if (!clientIP) {
    return { allowed: false, reason: "No IP found in headers" };
  }

  const isAllowed = config.allowedIPs.includes(clientIP);

  if (!isAllowed) {
    console.log(
      `\n🚫 [SECURITY] Blocked request from unauthorized IP: ${clientIP}`
    );
    console.log(`   Allowed IPs: ${config.allowedIPs.join(", ")}`);
    console.log(`   CF-Ray: ${cfRay}`);
  }

  return {
    allowed: isAllowed,
    ip: clientIP,
    reason: isAllowed ? undefined : `IP ${clientIP} not in whitelist`,
  };
}

function htmlResult(message: string, success: boolean): string {
  const iconSVG = success
    ? `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5 5-5"/></svg>`
    : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ccproxy — ${success ? "Success" : "Error"}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#000;color:#ededed;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{width:min(420px,90vw);text-align:center;animation:fadeIn .4s ease both}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .icon{margin-bottom:20px;opacity:${success ? '1' : '0.7'}}
  h2{font-size:1.25rem;font-weight:500;color:#fff;margin-bottom:16px;letter-spacing:-.02em}
  .msg{font-size:.875rem;line-height:1.7;color:#888}
  .msg code{font-family:'SF Mono',SFMono-Regular,Menlo,monospace;background:#111;border:1px solid #222;padding:2px 6px;border-radius:4px;font-size:.8em;color:#ededed}
  .back{display:inline-block;margin-top:28px;font-size:.8rem;color:#666;text-decoration:none;transition:color .15s}
  .back:hover{color:#fff}
</style>
</head><body>
<div class="card">
  <div class="icon">${iconSVG}</div>
  <h2>${success ? "Authenticated" : "Authentication Failed"}</h2>
  <div class="msg">${message}</div>
  <a href="/login" class="back">&larr; Back to login</a>
</div>
</body></html>`;
}

// Global error handlers to prevent silent crashes from unhandled errors
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  logger.error(`[FATAL] Uncaught exception: ${err.stack || err}`);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  logger.error(`[FATAL] Unhandled rejection: ${reason}`);
});

const server = Bun.serve({
  port: config.port,
  idleTimeout: 255, // 255 seconds for streaming responses

  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta",
        },
      });
    }

    // Check IP whitelist for API endpoints (not health checks)
    if (
      url.pathname.startsWith("/v1/") ||
      url.pathname.startsWith("/analytics") ||
      url.pathname.startsWith("/budget")
    ) {
      const ipCheck = checkIPWhitelist(req);
      if (!ipCheck.allowed) {
        return Response.json(
          {
            error: {
              type: "authentication_error",
              message: `Unauthorized: ${ipCheck.reason || "IP not whitelisted"
                }`,
            },
          },
          { status: 403 }
        );
      }
    }

    if (url.pathname === "/health" || url.pathname === "/") {
      const token = await getValidToken();
      return Response.json({
        status: "ok",
        claudeCode: {
          authenticated: !!token,
          expiresAt: token?.expiresAt,
          ...(token ? {} : { loginUrl: `http://localhost:${config.port}/login` }),
        },
        fallback: !!config.anthropicApiKey,
        openaiPassthrough: {
          enabled: isOpenAIPassthroughEnabled(),
          baseUrl: config.openaiBaseUrl,
        },
      });
    }

    // Anthropic-compatible endpoint
    if (url.pathname === "/v1/messages" && req.method === "POST") {
      try {
        logRequestDetails(req, "Anthropic /v1/messages");
        const body = (await req.json()) as AnthropicRequest;
        const headers = extractHeaders(req);

        // Check if user provided their own API key
        const userAPIKey = extractAPIKey(req);
        if (userAPIKey) {
          console.log(`\n🔑 Using user-provided API key from request`);
        }

        console.log(
          `\n→ Model: "${body.model}" | ${body.stream ? "stream" : "sync"
          } | max_tokens=${body.max_tokens}`
        );

        const response = await proxyRequest(
          "/v1/messages",
          body,
          headers,
          userAPIKey || undefined
        );

        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");

        return new Response(response.body, {
          status: response.status,
          headers: responseHeaders,
        });
      } catch (error) {
        console.error("Request handling error:", error);
        return Response.json(
          {
            type: "error",
            error: { type: "invalid_request_error", message: String(error) },
          } satisfies AnthropicError,
          { status: 400 }
        );
      }
    }

    // OpenAI-compatible endpoint
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      try {
        logRequestDetails(req, "OpenAI /v1/chat/completions");
        const openaiBody = (await req.json()) as OpenAIChatRequest;

        // Log the request body from Cursor (truncated)
        const bodyStr = JSON.stringify(openaiBody, null, 2);
        const truncatedBody =
          bodyStr.length > 500
            ? bodyStr.substring(0, 500) + "... [truncated]"
            : bodyStr;

        console.log(`\n📋 [Cursor Request Body]:`);
        console.log(`   Model: "${openaiBody.model}"`);
        console.log(`   Stream: ${openaiBody.stream || false}`);
        console.log(
          `   Max Tokens: ${openaiBody.max_tokens ||
          openaiBody.max_completion_tokens ||
          "not set"
          }`
        );
        console.log(`   Temperature: ${openaiBody.temperature || "not set"}`);
        console.log(`   Stream Options: ${JSON.stringify(openaiBody.stream_options) || "not set"}`);
        console.log(`   Messages Count: ${openaiBody.messages?.length || 0}`);
        // Log ALL top-level keys to understand what Cursor sends
        const allKeys = Object.keys(openaiBody);
        console.log(`   All Request Keys: ${allKeys.join(", ")}`);
        logger.info(`   All Request Keys: ${allKeys.join(", ")}`);
        if ((openaiBody as any).reasoning_effort) {
          console.log(`   Reasoning Effort: ${(openaiBody as any).reasoning_effort}`);
          logger.info(`   Reasoning Effort: ${(openaiBody as any).reasoning_effort}`);
        }

        // Log the FULL raw request body to file for debugging tool call format
        logger.verbose(`\n🔍 [FULL Cursor Request Body]:`);
        logger.verbose(JSON.stringify(openaiBody, null, 2));

        // Log all messages, especially system messages (verbose to file)
        if (openaiBody.messages && openaiBody.messages.length > 0) {
          logger.verbose(`\n📝 [Cursor Messages]:`);
          openaiBody.messages.forEach((msg, idx) => {
            const content =
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content);

            // For system messages, log the full content (might contain tool call format instructions)
            if (msg.role === "system") {
              logger.verbose(
                `   [${idx}] System Message (${content.length} chars):`
              );
              logger.verbose(
                `   ${content
                  .split("\n")
                  .map((l: string) => `      ${l}`)
                  .join("\n")}`
              );
            } else {
              // For other messages, log full content (no truncation in verbose mode)
              logger.verbose(
                `   [${idx}] ${msg.role} (${content.length} chars):`
              );
              logger.verbose(
                `   ${content
                  .split("\n")
                  .map((l: string) => `      ${l}`)
                  .join("\n")}`
              );
            }
          });
        }

        console.log(`\n   Body Preview: ${truncatedBody}`);

        // Passthrough to OpenAI/OpenRouter for non-Claude models
        if (shouldPassthroughToOpenAI(openaiBody.model)) {
          console.log(
            `\n→ [OpenAI Passthrough] ${openaiBody.model} | ${openaiBody.stream ? "stream" : "sync"
            }`
          );

          const response = await proxyOpenAIRequest(
            "/v1/chat/completions",
            openaiBody
          );

          const responseHeaders = new Headers(response.headers);
          responseHeaders.set("Access-Control-Allow-Origin", "*");

          return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
          });
        }

        // Convert to Anthropic for Claude models
        const anthropicBody = openaiToAnthropic(openaiBody);
        const headers = extractHeaders(req);

        // Check if user provided their own API key
        const userAPIKey = extractAPIKey(req);
        if (userAPIKey) {
          console.log(`\n🔑 Using user-provided API key from request`);
        }

        console.log(
          `\n→ [OpenAI→Anthropic] Original: "${openaiBody.model
          }" → Normalized: "${anthropicBody.model}" | ${anthropicBody.stream ? "stream" : "sync"
          } | max_tokens=${anthropicBody.max_tokens}`
        );
        if (anthropicBody.reasoning_budget) {
          console.log(`   Reasoning Budget: ${anthropicBody.reasoning_budget}`);
        }

        // Log the system prompt that will be sent to Claude Code (verbose to file)
        if (anthropicBody.system) {
          const systemContent =
            typeof anthropicBody.system === "string"
              ? anthropicBody.system
              : Array.isArray(anthropicBody.system)
                ? anthropicBody.system
                  .map((block) =>
                    block &&
                      typeof block === "object" &&
                      "type" in block &&
                      block.type === "text"
                      ? block.text
                      : JSON.stringify(block)
                  )
                  .join("\n")
                : String(anthropicBody.system);
          logger.verbose(
            `\n📋 [Anthropic System Prompt] (${systemContent.length} chars):`
          );
          logger.verbose(
            systemContent
              .split("\n")
              .map((l: string) => `   ${l}`)
              .join("\n")
          );
        }

        // Log Anthropic messages (verbose to file)
        if (anthropicBody.messages && anthropicBody.messages.length > 0) {
          logger.verbose(
            `\n📨 [Anthropic Messages] (${anthropicBody.messages.length}):`
          );
          anthropicBody.messages.forEach((msg, idx) => {
            const content =
              typeof msg.content === "string"
                ? msg.content
                : Array.isArray(msg.content)
                  ? msg.content
                    .map((block) =>
                      block &&
                        typeof block === "object" &&
                        "type" in block &&
                        block.type === "text"
                        ? block.text
                        : JSON.stringify(block)
                    )
                    .join("\n")
                  : JSON.stringify(msg.content);
            // Log full content (no truncation in verbose mode for debugging tool calls)
            logger.verbose(
              `   [${idx}] ${msg.role} (${content.length} chars):`
            );
            logger.verbose(
              `   ${content
                .split("\n")
                .map((l: string) => `      ${l}`)
                .join("\n")}`
            );
          });
        }

        // Log what we're about to send (before Claude Code preparation)
        console.log(`\n📤 [Prepared Request Summary]:`);
        console.log(`   System prompt present: ${!!anthropicBody.system}`);
        if (anthropicBody.system) {
          const sysStr =
            typeof anthropicBody.system === "string"
              ? anthropicBody.system
              : "array";
          console.log(
            `   System type: ${typeof anthropicBody.system}, preview: ${String(
              sysStr
            ).substring(0, 100)}...`
          );
        }

        const response = await proxyRequest(
          "/v1/messages",
          anthropicBody,
          headers,
          userAPIKey || undefined
        );

        console.log(
          `   [Debug] Response status: ${response.status}, ok: ${response.ok}`
        );

        if (!response.ok) {
          const errorText = await response
            .clone()
            .text()
            .catch(() => "Unable to read error");
          console.log(
            `   [Debug] Error response: ${errorText.substring(0, 500)}`
          );
        }

        console.log(
          `   [Debug] Response headers: ${JSON.stringify(
            Object.fromEntries(response.headers)
          )}`
        );
        console.log(
          `   [Debug] Response body readable: ${response.body !== null}`
        );

        const responseHeaders = new Headers();
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Content-Type", "application/json");

        // Handle streaming
        if (anthropicBody.stream && response.ok) {
          responseHeaders.set("Content-Type", "text/event-stream");
          responseHeaders.set("Cache-Control", "no-cache");
          responseHeaders.set("Connection", "keep-alive");
          responseHeaders.set("X-Accel-Buffering", "no"); // Disable buffering for nginx/proxies

          const streamId = Date.now().toString();
          const reader = response.body?.getReader();

          logger.verbose(
            `   [Debug] Stream reader created: ${reader !== null}`
          );

          if (!reader) {
            return Response.json(
              { error: { message: "No response body" } },
              { status: 500 }
            );
          }

          let cancelled = false;
          const stream = new ReadableStream({
            async start(controller) {
              const decoder = new TextDecoder();
              let buffer = "";
              let sentStart = false;
              let toolCallBuffer = ""; // Buffer for tool calls that span multiple chunks
              let inToolCall = false;
              let lastChunkTime = Date.now();
              const HEARTBEAT_INTERVAL = 5000; // Send heartbeat every 5 seconds if buffering
              let currentBlockIndex = -1; // Track which content block we're processing
              let blockTextSent = false; // Track if we've sent text from content_block_start
              let toolCallIndex = 0; // Track tool call index for OpenAI format
              let currentToolCall: {
                id: string;
                name: string;
                inputJson: string;
              } | null = null; // Current tool_use block being streamed
              let inThinkingBlock = false; // Track if we're inside a thinking block (skip output)
              let usageInputTokens = 0; // Track input tokens from message_start
              let usageOutputTokens = 0; // Track output tokens from message_delta
              let usageCacheReadTokens = 0; // Track cache read tokens from message_start
              let usageCacheCreationTokens = 0; // Track cache creation tokens from message_start
              let messageStopped = false; // Track if message_stop was received
              // Per OpenAI spec: when stream_options.include_usage is set,
              // all intermediate chunks must have "usage": null
              const includeUsageNull = !!openaiBody.stream_options?.include_usage;

              // Helper to safely enqueue data, automatically injecting
              // "usage": null on SSE JSON chunks when include_usage is set
              const safeEnqueue = (data: Uint8Array) => {
                try {
                  if (!cancelled) {
                    if (includeUsageNull) {
                      // Check if this is an SSE chunk that needs usage: null
                      const str = new TextDecoder().decode(data);
                      if (str.startsWith('data: {') && !str.includes('"usage"')) {
                        // Inject "usage":null before the last } in the JSON
                        const injected = str.replace(
                          /\}\s*\n\n$/,
                          ',"usage":null}\n\n'
                        );
                        controller.enqueue(new TextEncoder().encode(injected));
                        return;
                      }
                    }
                    controller.enqueue(data);
                  }
                } catch {
                  // Controller might be closed, ignore
                  cancelled = true;
                }
              };

              try {
                logger.verbose(`   [Debug] Starting to read stream...`);
                let chunkCount = 0;
                while (true) {
                  if (cancelled) {
                    logger.verbose(`   [Debug] Stream cancelled by client`);
                    break;
                  }

                  const { done, value } = await reader.read();
                  if (done) {
                    console.log(
                      `   [Debug] Stream ended after ${chunkCount} chunks`
                    );
                    // If message_stop was not received, send usage + [DONE] as fallback
                    if (!messageStopped) {
                      console.log(
                        `   [Debug] Stream ended without message_stop, sending fallback usage chunk`
                      );
                      safeEnqueue(
                        new TextEncoder().encode(
                          createOpenAIStreamUsageChunk(
                            streamId,
                            openaiBody.model,
                            usageInputTokens,
                            usageOutputTokens,
                            usageCacheReadTokens,
                            usageCacheCreationTokens,
                          )
                        )
                      );
                      safeEnqueue(
                        new TextEncoder().encode("data: [DONE]\n\n")
                      );
                    }
                    break;
                  }

                  if (cancelled) break;

                  chunkCount++;
                  if (chunkCount === 1) {
                    console.log(
                      `   [Debug] First chunk received, length: ${value.length}`
                    );
                  }

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() || "";

                  for (const line of lines) {
                    if (cancelled) break;
                    if (!line.startsWith("data: ")) continue;
                    const data = line.slice(6);
                    if (data === "[DONE]") {
                      // Don't forward Anthropic's [DONE] - we send our own [DONE]
                      // after the usage chunk in the message_stop handler
                      continue;
                    }

                    try {
                      const event = JSON.parse(data);
                      if (chunkCount === 1) {
                        console.log(
                          `   [Debug] First event type: ${event.type
                          }, full event: ${JSON.stringify(event).substring(
                            0,
                            200
                          )}`
                        );
                      }

                      // Handle message_start - send OpenAI start chunk and capture usage
                      if (event.type === "message_start") {
                        if (!sentStart) {
                          safeEnqueue(
                            new TextEncoder().encode(
                              createOpenAIStreamStart(streamId, openaiBody.model)
                            )
                          );
                          sentStart = true;
                          console.log(
                            `   [Debug] Sent OpenAI stream start chunk`
                          );
                        }
                        // Capture input_tokens from message_start
                        if (event.message?.usage?.input_tokens !== undefined) {
                          usageInputTokens = event.message.usage.input_tokens;
                          usageCacheReadTokens = event.message.usage.cache_read_input_tokens || 0;
                          usageCacheCreationTokens = event.message.usage.cache_creation_input_tokens || 0;
                          console.log(
                            `   [Debug] Usage: input_tokens=${usageInputTokens} (cache_read=${usageCacheReadTokens}, cache_creation=${usageCacheCreationTokens})`
                          );
                        }
                      }

                      // Handle content_block_start - ensure we've sent start
                      if (event.type === "content_block_start") {
                        if (!sentStart) {
                          safeEnqueue(
                            new TextEncoder().encode(
                              createOpenAIStreamStart(
                                streamId,
                                openaiBody.model
                              )
                            )
                          );
                          sentStart = true;
                        }

                        // Log content_block_start for debugging (tool_use blocks come here)
                        const block = event.content_block;
                        logger.verbose(
                          `   [Debug] content_block_start: type=${block?.type
                          }, block=${JSON.stringify(block)}`
                        );

                        // Handle text blocks that might contain tool calls (complete blocks, not streaming)
                        currentBlockIndex = event.index ?? currentBlockIndex;
                        blockTextSent = false;

                        // Skip thinking blocks - internal reasoning, not for Cursor
                        if (block?.type === "thinking") {
                          inThinkingBlock = true;
                          logger.verbose(`   [Debug] Thinking block started (will be hidden from Cursor)`);
                          continue;
                        }
                        inThinkingBlock = false;

                        if (block?.type === "text" && block.text) {
                          const textContent = block.text;
                          logger.verbose(
                            `   [Debug] content_block_start text block (${textContent.length} chars): ${textContent}`
                          );
                          // Text blocks are handled in content_block_delta
                        }

                        // Handle tool_use blocks - Anthropic's native tool call format
                        if (block?.type === "tool_use") {
                          logger.verbose(
                            `   [Debug] tool_use block started: id=${block.id}, name=${block.name}`
                          );

                          // Strip mcp_ prefix from tool names in responses
                          const toolName = block.name?.startsWith("mcp_")
                            ? block.name.slice(4)
                            : block.name;

                          // Store current tool call info for accumulating input
                          currentToolCall = {
                            id: block.id,
                            name: toolName,
                            inputJson: "",
                          };

                          // Send the first OpenAI tool call chunk (id, type, function.name)
                          safeEnqueue(
                            new TextEncoder().encode(
                              createOpenAIToolCallChunk(
                                streamId,
                                openaiBody.model,
                                toolCallIndex,
                                block.id,
                                toolName,
                                undefined,
                                null
                              )
                            )
                          );
                        }
                      }

                      // Handle content_block_stop - reset block tracking and finalize tool calls
                      if (event.type === "content_block_stop") {
                        if (inThinkingBlock) {
                          inThinkingBlock = false;
                          logger.verbose(`   [Debug] Thinking block ended`);
                          continue;
                        }
                        logger.verbose(
                          `   [Debug] content_block_stop for index ${event.index}`
                        );

                        // If we were building a tool call, send the final arguments chunk
                        if (currentToolCall) {
                          logger.verbose(
                            `   [Debug] Finalizing tool call: ${currentToolCall.name} with args: ${currentToolCall.inputJson}`
                          );

                          // Send the arguments chunk
                          safeEnqueue(
                            new TextEncoder().encode(
                              createOpenAIToolCallChunk(
                                streamId,
                                openaiBody.model,
                                toolCallIndex,
                                undefined,
                                undefined,
                                currentToolCall.inputJson || "{}",
                                null
                              )
                            )
                          );

                          toolCallIndex++;
                          currentToolCall = null;
                        }

                        blockTextSent = false;
                        currentBlockIndex = -1;
                      }

                      // Skip deltas for thinking blocks
                      if (event.type === "content_block_delta" && inThinkingBlock) {
                        logger.verbose(`   [Debug] Skipping thinking delta`);
                        continue;
                      }

                      // Handle input_json_delta for tool_use blocks
                      if (
                        event.type === "content_block_delta" &&
                        event.delta?.type === "input_json_delta" &&
                        currentToolCall
                      ) {
                        const jsonChunk = event.delta.partial_json || "";
                        currentToolCall.inputJson += jsonChunk;
                        logger.verbose(
                          `   [Debug] input_json_delta: "${jsonChunk}" (total: ${currentToolCall.inputJson.length} chars)`
                        );
                        // Don't send anything yet - accumulate until content_block_stop
                        continue;
                      }

                      // Handle content_block_delta events
                      if (
                        event.type === "content_block_delta" &&
                        event.delta?.text
                      ) {
                        // Skip deltas if we already sent complete text from content_block_start
                        if (blockTextSent) {
                          logger.verbose(
                            `   [Debug] Skipping delta - already sent complete text from content_block_start`
                          );
                          continue;
                        }

                        if (!sentStart) {
                          safeEnqueue(
                            new TextEncoder().encode(
                              createOpenAIStreamStart(
                                streamId,
                                openaiBody.model
                              )
                            )
                          );
                          sentStart = true;
                        }

                        let text = event.delta.text;

                        // Log all text chunks for debugging (especially tool calls)
                        logger.verbose(
                          `   [Debug] content_block_delta chunk (${text.length
                          } chars): ${JSON.stringify(text)}`
                        );

                        // Check if this chunk contains tool call markers (including incorrect formats)
                        const hasToolCallMarkers =
                          /<function_calls/i.test(text) ||
                          /<invoke/i.test(text) ||
                          /<\/invoke>/i.test(text) ||
                          /<\/function_calls>/i.test(text) ||
                          /<search_files/i.test(text) ||
                          /<read_file/i.test(text) ||
                          /<\/search_files>/i.test(text) ||
                          /<\/read_file>/i.test(text) ||
                          /<grep>/i.test(text) ||
                          /<\/grep>/i.test(text);

                        // Also detect potential tool call starts (partial tags like "<search" or "<rea")
                        // This catches tool calls that start mid-chunk, even partial ones
                        const mightStartToolCall =
                          !inToolCall &&
                          (/<sea/i.test(text) || // <search_files
                            /<rea/i.test(text) || // <read_file
                            /<gre/i.test(text) || // <grep
                            /<inv/i.test(text) || // <invoke
                            /<fun/i.test(text)); // <function_calls

                        if (hasToolCallMarkers) {
                          logger.verbose(
                            `   [Debug] Detected tool call markers in chunk!`
                          );
                        }

                        if (mightStartToolCall) {
                          logger.verbose(
                            `   [Debug] Detected potential tool call start in chunk!`
                          );
                        }

                        if (
                          hasToolCallMarkers ||
                          inToolCall ||
                          mightStartToolCall
                        ) {
                          // Start or continue buffering tool calls
                          // If this is a new tool call starting mid-chunk, split it:
                          // send text before the tool call, buffer the tool call part
                          if (
                            !inToolCall &&
                            (mightStartToolCall || hasToolCallMarkers)
                          ) {
                            // Find where the tool call starts in this chunk
                            // Look for < followed by letters (start of a tag)
                            const toolCallStartMatch = text.match(/<[a-z]/i);
                            if (
                              toolCallStartMatch &&
                              toolCallStartMatch.index !== undefined
                            ) {
                              const beforeToolCall = text.substring(
                                0,
                                toolCallStartMatch.index
                              );
                              const toolCallPart = text.substring(
                                toolCallStartMatch.index
                              );

                              // Send the text before the tool call
                              if (beforeToolCall) {
                                safeEnqueue(
                                  new TextEncoder().encode(
                                    createOpenAIStreamChunk(
                                      streamId,
                                      openaiBody.model,
                                      beforeToolCall
                                    )
                                  )
                                );
                                logger.verbose(
                                  `   [Debug] Sent text before tool call: "${beforeToolCall}"`
                                );
                              }

                              // Buffer the tool call part
                              inToolCall = true;
                              toolCallBuffer = toolCallPart;
                              logger.verbose(
                                `   [Debug] Started buffering tool call: "${toolCallPart.substring(
                                  0,
                                  50
                                )}..."`
                              );
                            } else {
                              // Couldn't find start, buffer everything
                              inToolCall = true;
                              toolCallBuffer += text;
                              logger.verbose(
                                `   [Debug] Buffering entire chunk (no split point found)`
                              );
                            }
                          } else if (inToolCall) {
                            // Already in tool call, keep buffering
                            toolCallBuffer += text;
                            logger.verbose(
                              `   [Debug] Continuing to buffer tool call, total: ${toolCallBuffer.length} chars`
                            );
                          } else {
                            // Complete marker found but not in tool call yet, buffer everything
                            inToolCall = true;
                            toolCallBuffer += text;
                          }

                          // Check if we now have a complete tool call
                          // Extract the FIRST complete tool call from the buffer
                          let completeToolCall = "";
                          let remainingBuffer = "";

                          // Find opening tag first
                          const openMatch = toolCallBuffer.match(
                            /<(search_files|read_file|grep|invoke|function_calls)/i
                          );
                          if (
                            openMatch &&
                            openMatch.index !== undefined &&
                            openMatch[1]
                          ) {
                            const tagName = openMatch[1];
                            const closeTag = `</${tagName}>`;

                            // Find the matching closing tag
                            const closeIndex = toolCallBuffer.indexOf(
                              closeTag,
                              openMatch.index
                            );
                            if (closeIndex !== -1) {
                              // Extract the complete tool call (including the closing tag)
                              completeToolCall = toolCallBuffer.substring(
                                openMatch.index,
                                closeIndex + closeTag.length
                              );
                              // Everything after the closing tag is remaining buffer
                              remainingBuffer = toolCallBuffer.substring(
                                closeIndex + closeTag.length
                              );
                            }
                          }

                          if (completeToolCall) {
                            // Parse the XML tool call into structured format
                            const parsedToolCalls =
                              parseXMLToolCalls(completeToolCall);

                            // Update buffer with remaining content
                            toolCallBuffer = remainingBuffer;
                            if (!toolCallBuffer) {
                              inToolCall = false;
                            }

                            if (parsedToolCalls.length > 0) {
                              logger.verbose(
                                `   [Debug] Parsed ${parsedToolCalls.length
                                } tool call(s) from XML:\n${JSON.stringify(
                                  parsedToolCalls,
                                  null,
                                  2
                                )}`
                              );

                              // Emit OpenAI tool_calls format for each parsed tool call
                              for (const [i, tc] of parsedToolCalls.entries()) {
                                const toolCallId = `call_${Date.now()}_${i}`;

                                // First chunk: id, type, function.name
                                safeEnqueue(
                                  new TextEncoder().encode(
                                    createOpenAIToolCallChunk(
                                      streamId,
                                      openaiBody.model,
                                      toolCallIndex,
                                      toolCallId,
                                      tc.name,
                                      undefined,
                                      null
                                    )
                                  )
                                );

                                // Second chunk: function.arguments (as JSON string)
                                safeEnqueue(
                                  new TextEncoder().encode(
                                    createOpenAIToolCallChunk(
                                      streamId,
                                      openaiBody.model,
                                      toolCallIndex,
                                      undefined,
                                      undefined,
                                      JSON.stringify(tc.arguments),
                                      null
                                    )
                                  )
                                );

                                toolCallIndex++;
                              }
                            } else {
                              // Fallback: couldn't parse, send as text
                              logger.verbose(
                                `   [Debug] Could not parse tool call, sending as text: ${completeToolCall.substring(
                                  0,
                                  100
                                )}...`
                              );
                              safeEnqueue(
                                new TextEncoder().encode(
                                  createOpenAIStreamChunk(
                                    streamId,
                                    openaiBody.model,
                                    completeToolCall
                                  )
                                )
                              );
                            }
                            continue;
                          } else {
                            // Still buffering incomplete tool call
                            // Send heartbeat comment to keep connection alive if we've been buffering for a while
                            const timeSinceLastChunk =
                              Date.now() - lastChunkTime;
                            if (timeSinceLastChunk > HEARTBEAT_INTERVAL) {
                              // Send a comment chunk to keep connection alive
                              safeEnqueue(
                                new TextEncoder().encode(
                                  createOpenAIStreamChunk(
                                    streamId,
                                    openaiBody.model,
                                    "" // Empty content, just keep connection alive
                                  )
                                )
                              );
                              lastChunkTime = Date.now();
                            }
                            continue;
                          }
                        }
                        // Note: We no longer flush the buffer prematurely here.
                        // The buffer is only flushed when we detect a complete tool call
                        // or at the end of the stream.

                        // Translate any remaining tool calls in the text (safety check)
                        if (needsTranslation(text)) {
                          const originalText = text;
                          text = translateToolCalls(text);
                          if (text !== originalText) {
                            logger.verbose(
                              `   [Debug] Translated tool call format in chunk:\n     Original (${originalText.length
                              } chars):\n${originalText
                                .split("\n")
                                .map((l: string) => `       ${l}`)
                                .join("\n")}\n     Translated (${text.length
                              } chars):\n${text
                                .split("\n")
                                .map((l: string) => `       ${l}`)
                                .join("\n")}`
                            );
                          }
                        }

                        safeEnqueue(
                          new TextEncoder().encode(
                            createOpenAIStreamChunk(
                              streamId,
                              openaiBody.model,
                              text
                            )
                          )
                        );
                        lastChunkTime = Date.now();
                      }

                      // Handle message_delta - capture output_tokens usage
                      if (event.type === "message_delta") {
                        if (event.usage?.output_tokens !== undefined) {
                          usageOutputTokens = event.usage.output_tokens;
                          console.log(
                            `   [Debug] Usage: output_tokens=${usageOutputTokens}`
                          );
                        }
                      }

                      // Handle message_stop
                      if (event.type === "message_stop") {
                        messageStopped = true;
                        // Flush any remaining tool call buffer (force flush)
                        if (toolCallBuffer) {
                          const parsedToolCalls =
                            parseXMLToolCalls(toolCallBuffer);
                          if (parsedToolCalls.length > 0) {
                            for (const [i, tc] of parsedToolCalls.entries()) {
                              const toolCallId = `call_${Date.now()}_${i}`;

                              safeEnqueue(
                                new TextEncoder().encode(
                                  createOpenAIToolCallChunk(
                                    streamId,
                                    openaiBody.model,
                                    toolCallIndex,
                                    toolCallId,
                                    tc.name,
                                    undefined,
                                    null
                                  )
                                )
                              );

                              safeEnqueue(
                                new TextEncoder().encode(
                                  createOpenAIToolCallChunk(
                                    streamId,
                                    openaiBody.model,
                                    toolCallIndex,
                                    undefined,
                                    undefined,
                                    JSON.stringify(tc.arguments),
                                    null
                                  )
                                )
                              );

                              toolCallIndex++;
                            }
                            logger.verbose(
                              `   [Debug] Flushed final tool call buffer: ${parsedToolCalls.length} tool calls`
                            );
                          } else {
                            // Couldn't parse, send as text
                            safeEnqueue(
                              new TextEncoder().encode(
                                createOpenAIStreamChunk(
                                  streamId,
                                  openaiBody.model,
                                  toolCallBuffer
                                )
                              )
                            );
                          }
                          toolCallBuffer = "";
                          inToolCall = false;
                        }

                        // Use "tool_calls" finish reason if we emitted any tool calls
                        const finishReason =
                          toolCallIndex > 0 ? "tool_calls" : "stop";

                        safeEnqueue(
                          new TextEncoder().encode(
                            createOpenAIStreamChunk(
                              streamId,
                              openaiBody.model,
                              undefined,
                              finishReason as "stop" | "length",
                              {
                                prompt_tokens: usageInputTokens,
                                completion_tokens: usageOutputTokens,
                                total_tokens: usageInputTokens + usageOutputTokens,
                                prompt_tokens_details: {
                                  cached_tokens: usageCacheReadTokens,
                                },
                                completion_tokens_details: {
                                  reasoning_tokens: 0,
                                },
                              }
                            )
                          )
                        );
                        // Always send usage chunk before [DONE] so Cursor can display remaining context
                        safeEnqueue(
                          new TextEncoder().encode(
                            createOpenAIStreamUsageChunk(
                              streamId,
                              openaiBody.model,
                              usageInputTokens,
                              usageOutputTokens,
                              usageCacheReadTokens,
                              usageCacheCreationTokens,
                            )
                          )
                        );
                        console.log(
                          `   [Debug] Sent usage chunk: prompt=${usageInputTokens}, completion=${usageOutputTokens}, total=${usageInputTokens + usageOutputTokens}`
                        );
                        safeEnqueue(
                          new TextEncoder().encode("data: [DONE]\n\n")
                        );
                        logger.verbose(
                          `   [Debug] Sent [DONE] chunk with finish_reason: ${finishReason}`
                        );
                      }
                    } catch (parseError) {
                      // Only log if not cancelled (avoid spam when cancelled)
                      if (!cancelled) {
                        console.log(
                          `   [Debug] Failed to parse event: ${parseError}`
                        );
                      }
                      // Skip unparseable events
                    }
                  }
                }
              } catch (streamError) {
                // Only log/error if not cancelled
                if (!cancelled) {
                  console.error(
                    `   [Error] Stream processing failed: ${streamError}`
                  );
                  try {
                    controller.error(streamError);
                  } catch {
                    // Controller already closed, ignore
                  }
                }
              } finally {
                // Cancel upstream reader if still active
                try {
                  if (!cancelled) {
                    reader.cancel().catch(() => {
                      // Reader might already be cancelled, ignore
                    });
                  }
                } catch {
                  // Reader might already be released, ignore
                }

                // Close controller if not already closed
                try {
                  if (!cancelled) {
                    controller.close();
                  }
                } catch {
                  // Controller already closed, ignore
                }
              }
            },
            cancel(reason) {
              logger.verbose(
                `   [Debug] Stream cancelled by client: ${reason}`
              );
              cancelled = true;
              // Cancel the upstream reader
              reader.cancel(reason).catch(() => {
                // Reader might already be cancelled, ignore
              });
            },
          });

          return new Response(stream, { headers: responseHeaders });
        }

        // Non-streaming response
        if (!response.ok) {
          const error = (await response.json()) as {
            error?: { message?: string; type?: string };
          };
          // Normalize model name in error messages if present
          let errorMessage = error?.error?.message || "Unknown error";
          if (errorMessage.includes("model:")) {
            // Replace any x- prefixed model names in error message with normalized version
            errorMessage = errorMessage.replace(
              /model:\s*x-([^\s,]+)/g,
              (_match, modelName) => `model: ${modelName}`
            );
          }
          return Response.json(
            {
              error: {
                message: errorMessage,
                type: error?.error?.type,
              },
            },
            { status: response.status, headers: responseHeaders }
          );
        }

        const anthropicResponse = await response.json();
        const openaiResponse = anthropicToOpenai(
          anthropicResponse,
          openaiBody.model
        );

        return Response.json(openaiResponse, { headers: responseHeaders });
      } catch (error) {
        console.error("OpenAI request handling error:", error);
        return Response.json(
          { error: { message: String(error), type: "invalid_request_error" } },
          { status: 400 }
        );
      }
    }

    // OpenAI models endpoint (for compatibility)
    if (url.pathname === "/v1/models" && req.method === "GET") {
      return Response.json({
        object: "list",
        data: [
          // Claude 4.5 models (Anthropic format)
          {
            id: "claude-sonnet-4-5",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
            context_length: 200000,
            max_output_tokens: 64000,
          },
          {
            id: "claude-opus-4-5",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
            context_length: 200000,
            max_output_tokens: 64000,
          },
          {
            id: "claude-haiku-4-5",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
            context_length: 200000,
            max_output_tokens: 64000,
          },
          // Cursor format models (will be normalized)
          {
            id: "claude-4.5-opus-high",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
            context_length: 200000,
            max_output_tokens: 64000,
          },
          {
            id: "claude-4.5-sonnet-high",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
            context_length: 200000,
            max_output_tokens: 64000,
          },
          {
            id: "claude-4.5-haiku",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
            context_length: 200000,
            max_output_tokens: 64000,
          },
          // Cursor format models with -thinking suffix
          {
            id: "claude-4.5-opus-high-thinking",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
            context_length: 200000,
            max_output_tokens: 64000,
          },
          {
            id: "claude-4.5-sonnet-high-thinking",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
            context_length: 200000,
            max_output_tokens: 64000,
          },
          {
            id: "claude-4.5-haiku-thinking",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
            context_length: 200000,
            max_output_tokens: 64000,
          },
        ],
      });
    }

    // Analytics endpoints
    if (url.pathname === "/analytics" && req.method === "GET") {
      const period = url.searchParams.get("period") || "day";
      const now = Date.now();
      let since: number;

      switch (period) {
        case "hour":
          since = now - 60 * 60 * 1000;
          break;
        case "day":
          since = now - 24 * 60 * 60 * 1000;
          break;
        case "week":
          since = now - 7 * 24 * 60 * 60 * 1000;
          break;
        case "month":
          since = now - 30 * 24 * 60 * 60 * 1000;
          break;
        case "all":
          since = 0;
          break;
        default:
          since = now - 24 * 60 * 60 * 1000;
      }

      const analytics = getAnalytics(since, now);

      return Response.json({
        period,
        ...analytics,
        estimatedApiKeyCostFormatted: formatCost(analytics.estimatedApiKeyCost),
        estimatedSavingsFormatted: formatCost(analytics.estimatedSavings),
        note: "Costs are estimates. Actual costs may be lower due to prompt caching.",
      });
    }

    if (url.pathname === "/analytics/requests" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const requests = getRecentRequests(Math.min(limit, 1000));
      return Response.json({ requests });
    }

    if (url.pathname === "/analytics/reset" && req.method === "POST") {
      const result = resetAnalytics();
      return Response.json({ success: true, ...result });
    }

    // Budget endpoints
    if (url.pathname === "/budget" && req.method === "GET") {
      const settings = getBudgetSettings();
      return Response.json(settings);
    }

    if (url.pathname === "/budget" && req.method === "POST") {
      try {
        const body = (await req.json()) as Partial<BudgetSettings>;
        updateBudgetSettings(body);
        return Response.json({ success: true, settings: getBudgetSettings() });
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 400 });
      }
    }

    // ---------- OAuth login flow ----------
    if (url.pathname === "/login" && req.method === "GET") {
      cleanPkceStore();
      const { codeVerifier, codeChallenge } = await generatePKCE();
      const state = crypto.randomUUID();
      pkceStore.set(state, { codeVerifier, createdAt: Date.now() });
      const authURL = getAuthorizationURL(codeChallenge, state);

      return new Response(
        `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ccproxy — Login</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#000;color:#ededed;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}

  .wrapper{width:min(460px,100%)}

  .header{margin-bottom:32px;animation:fadeIn .4s ease both}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

  .logo{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .logo svg{width:20px;height:20px}
  .logo-text{font-size:.9375rem;font-weight:600;color:#fff;letter-spacing:-.01em}
  .subtitle{font-size:.8125rem;color:#666}

  .card{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;animation:fadeIn .5s .05s ease both}

  .steps{padding:24px 24px 0}
  .step{display:flex;gap:12px;margin-bottom:20px;position:relative}
  .step:last-child{margin-bottom:0}
  .step:not(:last-child)::after{content:'';position:absolute;left:13px;top:32px;bottom:-8px;width:1px;background:#1a1a1a}

  .step-num{flex-shrink:0;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    font-size:.75rem;font-weight:500;background:#111;color:#888;border:1px solid #222}
  .step-content{flex:1;padding-top:3px}
  .step-title{font-size:.8125rem;font-weight:500;color:#ededed;margin-bottom:4px}
  .step-desc{font-size:.75rem;color:#666;line-height:1.5}

  .auth-link{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:7px 14px;
    background:transparent;border:1px solid #333;border-radius:6px;color:#ededed;
    font-size:.8125rem;font-weight:500;text-decoration:none;transition:all .15s}
  .auth-link:hover{background:#111;border-color:#444}
  .auth-link svg{width:14px;height:14px;transition:transform .15s}
  .auth-link:hover svg{transform:translateX(2px)}

  .form-area{padding:20px 24px 24px;margin-top:20px;border-top:1px solid #1a1a1a}
  .input-label{display:block;font-size:.75rem;font-weight:500;color:#888;margin-bottom:8px}

  input[type=text]{width:100%;padding:10px 12px;background:#000;border:1px solid #333;border-radius:8px;
    color:#ededed;font-family:inherit;font-size:.875rem;outline:none;transition:border-color .15s}
  input[type=text]::placeholder{color:#444}
  input[type=text]:hover{border-color:#444}
  input[type=text]:focus{border-color:#ededed;box-shadow:0 0 0 1px #ededed}

  .submit-btn{width:100%;padding:10px 16px;border:none;border-radius:8px;cursor:pointer;
    font-family:inherit;font-size:.875rem;font-weight:500;margin-top:12px;
    background:#ededed;color:#000;transition:background .15s;position:relative}
  .submit-btn:hover{background:#fff}
  .submit-btn:active{background:#ccc}
  .submit-btn:disabled{opacity:.5;cursor:not-allowed}
  .submit-btn.loading{color:transparent;pointer-events:none}
  .submit-btn.loading::after{content:'';position:absolute;width:16px;height:16px;
    border:2px solid #666;border-top-color:#000;border-radius:50%;
    animation:spin .5s linear infinite;top:50%;left:50%;margin:-8px 0 0 -8px}
  @keyframes spin{to{transform:rotate(360deg)}}

  .footer{text-align:center;margin-top:20px;animation:fadeIn .4s .15s ease both}
  .footer-note{font-size:.75rem;color:#444}
</style>
</head><body>
<div class="wrapper">
  <div class="header">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ededed" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
      <span class="logo-text">ccproxy</span>
    </div>
    <p class="subtitle">Connect your Anthropic account via OAuth PKCE</p>
  </div>

  <div class="card">
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-content">
          <div class="step-title">Authorize with Anthropic</div>
          <div class="step-desc">Open the consent page to grant access to your account.</div>
          <a href="${authURL}" target="_blank" rel="noopener" class="auth-link" id="authLink">
            Open authorization page
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
          </a>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-content">
          <div class="step-title">Copy the authorization code</div>
          <div class="step-desc">After approving, copy the code from the callback page.</div>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-content">
          <div class="step-title">Paste it below</div>
          <div class="step-desc">Submit the code to complete the token exchange.</div>
        </div>
      </div>
    </div>

    <div class="form-area">
      <form method="POST" action="/oauth/callback" id="authForm">
        <input type="hidden" name="state" value="${state}">
        <label class="input-label" for="codeInput">Authorization Code</label>
        <input type="text" id="codeInput" name="code" placeholder="Paste code here..." required autofocus autocomplete="off" spellcheck="false">
        <button type="submit" class="submit-btn" id="submitBtn">Authenticate</button>
      </form>
    </div>
  </div>

  <div class="footer">
    <p class="footer-note">Code expires in ~10 minutes &middot; single-use only</p>
  </div>
</div>

<script>
  document.getElementById('authForm').addEventListener('submit', function() {
    var btn = document.getElementById('submitBtn');
    btn.classList.add('loading');
    btn.disabled = true;
  });
</script>
</body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (url.pathname === "/oauth/callback" && req.method === "POST") {
      try {
        const formData = await req.formData();
        const code = formData.get("code") as string | null;
        const state = formData.get("state") as string | null;

        if (!code || !state) {
          return new Response(htmlResult("Missing code or state parameter.", false), {
            status: 400,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        cleanPkceStore();
        const pkce = pkceStore.get(state);
        if (!pkce) {
          return new Response(
            htmlResult("Invalid or expired state. Please go back to /login and try again.", false),
            { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }
        pkceStore.delete(state);

        const auth = await exchangeCode(code, pkce.codeVerifier, state);
        const expiresIn = Math.round(
          (auth.expiresAt - Date.now()) / 1000 / 60
        );
        console.log(
          `✓ OAuth login successful — token expires in ${expiresIn} minutes`
        );

        return new Response(
          htmlResult(
            `Authentication successful! Token expires in ${expiresIn} minutes.<br>Credentials saved to <code>${CCPROXY_AUTH_PATH}</code>.<br>You can close this page.`,
            true
          ),
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      } catch (error) {
        console.error("OAuth callback error:", error);
        return new Response(
          htmlResult(`Authentication failed: ${String(error)}`, false),
          { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    }

    return Response.json(
      {
        type: "error",
        error: {
          type: "not_found_error",
          message: `Unknown endpoint: ${url.pathname}`,
        },
      } satisfies AnthropicError,
      { status: 404 }
    );
  },
});

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Claude Code Proxy                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Anthropic-compatible API that routes through Claude Code     ║
║  subscription first, then falls back to direct API.           ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Initialize database
getDb();

console.log(`🚀 Server running at http://localhost:${server.port}`);
console.log(`   Anthropic:  http://localhost:${server.port}/v1/messages`);
console.log(
  `   OpenAI:     http://localhost:${server.port}/v1/chat/completions`
);
console.log(`   Analytics:  http://localhost:${server.port}/analytics`);
console.log(`   Budget:     http://localhost:${server.port}/budget`);
console.log(`   Login:      http://localhost:${server.port}/login\n`);

await checkCredentials();

if (isOpenAIPassthroughEnabled()) {
  console.log(`✓ OpenAI passthrough enabled → ${config.openaiBaseUrl}`);
} else {
  console.log("⚠️  No OPENAI_API_KEY (non-Claude models will fail)");
}

console.log("\n📋 Usage in Cursor/other clients:");
console.log(`   API Base URL: http://localhost:${server.port}`);
console.log("   API Key: (any value, e.g. 'proxy')");
console.log(`\n📝 Verbose logging enabled → api.log (gitignored)\n`);
