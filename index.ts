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
  const accentColor = success ? "#00e5a0" : "#ff4d6a";
  const accentGlow = success ? "rgba(0,229,160,0.15)" : "rgba(255,77,106,0.15)";
  const iconSVG = success
    ? `<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="23" stroke="${accentColor}" stroke-width="2" opacity="0.3"/><circle cx="24" cy="24" r="18" fill="${accentGlow}"/><path d="M16 24.5L21.5 30L33 18" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="23" stroke="${accentColor}" stroke-width="2" opacity="0.3"/><circle cx="24" cy="24" r="18" fill="${accentGlow}"/><path d="M18 18L30 30M30 18L18 30" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round"/></svg>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ccproxy — ${success ? "Success" : "Error"}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Outfit:wght@300;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--accent:${accentColor};--glow:${accentGlow};--bg:#08090c;--surface:#0f1117;--border:rgba(255,255,255,0.06);--text:#c8cdd5;--text-dim:#5a6170}
  body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
  body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 60% 50% at 50% 0%,var(--glow),transparent 70%);pointer-events:none;z-index:0}
  /* Noise texture overlay */
  body::after{content:'';position:fixed;inset:0;opacity:0.03;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");pointer-events:none;z-index:0}
  .card{position:relative;z-index:1;width:min(460px,90vw);background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:48px 40px;text-align:center;
    box-shadow:0 0 80px -20px var(--glow),0 40px 60px -30px rgba(0,0,0,0.6);
    animation:slideUp 0.6s cubic-bezier(0.16,1,0.3,1) both}
  @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
  .icon{margin-bottom:24px;animation:pop 0.5s 0.3s cubic-bezier(0.34,1.56,0.64,1) both}
  @keyframes pop{from{opacity:0;transform:scale(0.5)}to{opacity:1;transform:scale(1)}}
  h2{font-size:1.5rem;font-weight:700;color:#fff;margin-bottom:12px;letter-spacing:-0.02em}
  .msg{font-size:0.92rem;line-height:1.7;color:var(--text);font-weight:300}
  .msg code{font-family:'JetBrains Mono',monospace;background:rgba(255,255,255,0.05);border:1px solid var(--border);padding:2px 8px;border-radius:6px;font-size:0.82em;color:var(--accent)}
  .divider{width:40px;height:2px;background:var(--accent);margin:20px auto;border-radius:2px;opacity:0.4}
  .back{display:inline-block;margin-top:24px;font-size:0.82rem;color:var(--text-dim);text-decoration:none;font-family:'JetBrains Mono',monospace;letter-spacing:0.03em;transition:color 0.2s}
  .back:hover{color:var(--accent)}
</style>
</head><body>
<div class="card">
  <div class="icon">${iconSVG}</div>
  <h2>${success ? "Authentication Successful" : "Authentication Failed"}</h2>
  <div class="divider"></div>
  <div class="msg">${message}</div>
  <a href="/login" class="back">&larr; back to login</a>
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
          },
          {
            id: "claude-opus-4-5",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
          },
          {
            id: "claude-haiku-4-5",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
          },
          // Cursor format models (will be normalized)
          {
            id: "claude-4.5-opus-high",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
          },
          {
            id: "claude-4.5-sonnet-high",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
          },
          {
            id: "claude-4.5-haiku",
            object: "model",
            created: 1700000000,
            owned_by: "anthropic",
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    --accent:#00e5a0;--accent-dim:rgba(0,229,160,0.12);--accent-glow:rgba(0,229,160,0.08);
    --bg:#08090c;--surface:#0f1117;--surface-2:#141820;--surface-hover:#181d27;
    --border:rgba(255,255,255,0.06);--border-accent:rgba(0,229,160,0.2);
    --text:#c8cdd5;--text-bright:#eef1f5;--text-dim:#454d5e;
    --danger:#ff4d6a;--warning:#fbbf24
  }
  html{height:100%}
  body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;overflow-x:hidden;padding:20px}

  /* Ambient background */
  body::before{content:'';position:fixed;top:-40%;left:-20%;width:140%;height:100%;
    background:radial-gradient(ellipse 50% 40% at 30% 20%,rgba(0,229,160,0.04),transparent 60%),
               radial-gradient(ellipse 40% 50% at 70% 80%,rgba(99,102,241,0.03),transparent 60%);
    pointer-events:none;z-index:0;animation:drift 20s ease-in-out infinite alternate}
  @keyframes drift{0%{transform:translate(0,0) rotate(0deg)}100%{transform:translate(2%,-3%) rotate(1deg)}}

  /* Grain overlay */
  body::after{content:'';position:fixed;inset:0;opacity:0.025;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    pointer-events:none;z-index:0}

  .wrapper{position:relative;z-index:1;width:min(520px,100%)}

  /* Header */
  .header{text-align:center;margin-bottom:40px;animation:fadeIn 0.6s cubic-bezier(0.16,1,0.3,1) both}
  @keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}

  .logo{display:inline-flex;align-items:center;gap:10px;margin-bottom:16px}
  .logo-icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--accent),#00b87a);display:flex;align-items:center;justify-content:center;
    box-shadow:0 0 24px rgba(0,229,160,0.2)}
  .logo-icon svg{width:20px;height:20px}
  .logo-text{font-family:'JetBrains Mono',monospace;font-size:1.1rem;font-weight:600;color:var(--text-bright);letter-spacing:-0.02em}
  .logo-tag{font-size:0.65rem;font-family:'JetBrains Mono',monospace;color:var(--accent);background:var(--accent-dim);
    padding:2px 8px;border-radius:20px;margin-left:4px;font-weight:500;letter-spacing:0.04em}

  .subtitle{font-size:0.88rem;color:var(--text-dim);font-weight:300;letter-spacing:0.02em}

  /* Card */
  .card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:0;overflow:hidden;
    box-shadow:0 0 0 1px rgba(255,255,255,0.02),0 40px 80px -20px rgba(0,0,0,0.5),0 0 120px -40px var(--accent-glow);
    animation:slideUp 0.7s 0.1s cubic-bezier(0.16,1,0.3,1) both}
  @keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}

  /* Steps */
  .steps{padding:36px 36px 0}
  .step{display:flex;gap:16px;margin-bottom:28px;position:relative}
  .step:last-child{margin-bottom:0}

  /* Step connector line */
  .step:not(:last-child)::after{content:'';position:absolute;left:17px;top:40px;bottom:-12px;width:1px;
    background:linear-gradient(to bottom,var(--border-accent) 0%,transparent 100%)}

  .step-num{flex-shrink:0;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    font-family:'JetBrains Mono',monospace;font-size:0.78rem;font-weight:600;
    background:var(--accent-dim);color:var(--accent);border:1px solid var(--border-accent);
    transition:all 0.3s ease}
  .step:hover .step-num{background:var(--accent);color:var(--bg);box-shadow:0 0 20px rgba(0,229,160,0.25)}

  .step-content{flex:1;padding-top:6px}
  .step-title{font-size:0.92rem;font-weight:500;color:var(--text-bright);margin-bottom:6px;letter-spacing:-0.01em}
  .step-desc{font-size:0.82rem;color:var(--text-dim);line-height:1.6;font-weight:300}

  /* Auth link button */
  .auth-link{display:inline-flex;align-items:center;gap:8px;margin-top:10px;padding:10px 20px;
    background:linear-gradient(135deg,rgba(0,229,160,0.12),rgba(0,229,160,0.06));
    border:1px solid var(--border-accent);border-radius:10px;color:var(--accent);
    font-family:'JetBrains Mono',monospace;font-size:0.82rem;font-weight:500;
    text-decoration:none;transition:all 0.25s ease;letter-spacing:0.01em}
  .auth-link:hover{background:linear-gradient(135deg,rgba(0,229,160,0.2),rgba(0,229,160,0.1));
    box-shadow:0 0 30px rgba(0,229,160,0.12);transform:translateY(-1px)}
  .auth-link:active{transform:translateY(0)}
  .auth-link svg{width:16px;height:16px;transition:transform 0.25s ease}
  .auth-link:hover svg{transform:translateX(3px)}

  /* Form area */
  .form-area{padding:28px 36px 36px;margin-top:28px;border-top:1px solid var(--border);
    background:linear-gradient(to bottom,rgba(255,255,255,0.01),transparent)}
  .input-group{position:relative;margin-bottom:16px}
  .input-label{display:block;font-size:0.72rem;font-family:'JetBrains Mono',monospace;font-weight:500;
    color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px}

  .input-wrapper{position:relative;display:flex;align-items:center}
  .input-icon{position:absolute;left:14px;color:var(--text-dim);transition:color 0.2s}
  .input-icon svg{width:18px;height:18px}

  input[type=text]{width:100%;padding:14px 16px 14px 44px;
    background:var(--surface-2);border:1px solid var(--border);border-radius:12px;
    color:var(--text-bright);font-family:'JetBrains Mono',monospace;font-size:0.88rem;
    outline:none;transition:all 0.25s ease;letter-spacing:0.01em}
  input[type=text]::placeholder{color:var(--text-dim);font-family:'JetBrains Mono',monospace;font-weight:400}
  input[type=text]:hover{border-color:rgba(255,255,255,0.1);background:var(--surface-hover)}
  input[type=text]:focus{border-color:var(--accent);background:var(--surface-hover);
    box-shadow:0 0 0 3px var(--accent-dim),0 0 24px -4px rgba(0,229,160,0.1)}
  input[type=text]:focus ~ .input-focus-ring{opacity:1}
  input[type=text]:focus + .input-icon{color:var(--accent)}

  .submit-btn{width:100%;padding:14px 24px;border:none;border-radius:12px;cursor:pointer;
    font-family:'Outfit',sans-serif;font-size:0.92rem;font-weight:600;letter-spacing:0.02em;
    background:linear-gradient(135deg,var(--accent),#00c98b);color:#08090c;
    transition:all 0.25s ease;position:relative;overflow:hidden}
  .submit-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,transparent,rgba(255,255,255,0.15));
    opacity:0;transition:opacity 0.25s ease}
  .submit-btn:hover{box-shadow:0 0 40px rgba(0,229,160,0.25);transform:translateY(-1px)}
  .submit-btn:hover::before{opacity:1}
  .submit-btn:active{transform:translateY(0);box-shadow:0 0 20px rgba(0,229,160,0.15)}
  .submit-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none;box-shadow:none}

  /* Loading state */
  .submit-btn.loading{pointer-events:none;color:transparent}
  .submit-btn.loading::after{content:'';position:absolute;width:20px;height:20px;
    border:2px solid rgba(8,9,12,0.3);border-top-color:#08090c;border-radius:50%;
    animation:spin 0.6s linear infinite;top:50%;left:50%;margin:-10px 0 0 -10px}
  @keyframes spin{to{transform:rotate(360deg)}}

  /* Footer note */
  .footer{text-align:center;margin-top:24px;animation:fadeIn 0.6s 0.3s cubic-bezier(0.16,1,0.3,1) both}
  .footer-note{display:inline-flex;align-items:center;gap:6px;font-size:0.75rem;
    color:var(--text-dim);font-family:'JetBrains Mono',monospace;letter-spacing:0.02em}
  .footer-note svg{width:14px;height:14px;opacity:0.5}

  /* Pulse dot */
  .pulse{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);
    margin-right:4px;animation:pulse 2s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 4px var(--accent)}50%{opacity:0.4;box-shadow:none}}

  /* Status badge */
  .status{display:inline-flex;align-items:center;gap:6px;padding:4px 12px 4px 8px;
    background:var(--accent-dim);border:1px solid var(--border-accent);border-radius:20px;
    font-size:0.7rem;font-family:'JetBrains Mono',monospace;color:var(--accent);margin-top:10px}

  /* Mobile */
  @media(max-width:540px){
    .steps{padding:28px 24px 0}
    .form-area{padding:24px}
    .step{gap:12px}
  }
</style>
</head><body>
<div class="wrapper">
  <div class="header">
    <div class="logo">
      <div class="logo-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="#08090c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <span class="logo-text">ccproxy</span>
      <span class="logo-tag">OAuth</span>
    </div>
    <p class="subtitle">Connect your Anthropic account via OAuth PKCE</p>
  </div>

  <div class="card">
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-content">
          <div class="step-title">Authorize with Anthropic</div>
          <div class="step-desc">You'll be redirected to Claude's OAuth consent screen to grant access.</div>
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
          <div class="step-desc">After approving, a single-use code will appear on the Anthropic callback page.</div>
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
        <div class="input-group">
          <label class="input-label" for="codeInput">Authorization Code</label>
          <div class="input-wrapper">
            <input type="text" id="codeInput" name="code" placeholder="Paste code here…" required autofocus autocomplete="off" spellcheck="false">
            <div class="input-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
          </div>
        </div>
        <button type="submit" class="submit-btn" id="submitBtn">Authenticate</button>
      </form>
    </div>
  </div>

  <div class="footer">
    <div class="footer-note">
      <span class="pulse"></span>
      Code expires in ~10 minutes · single-use only
    </div>
  </div>
</div>

<script>
  // Form submission feedback
  document.getElementById('authForm').addEventListener('submit', function() {
    const btn = document.getElementById('submitBtn');
    btn.classList.add('loading');
    btn.disabled = true;
  });

  // Auto-paste detection
  const input = document.getElementById('codeInput');
  input.addEventListener('paste', function() {
    setTimeout(() => {
      if (input.value.trim().length > 10) {
        input.style.borderColor = 'var(--accent)';
        input.style.boxShadow = '0 0 0 3px var(--accent-dim)';
      }
    }, 50);
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
