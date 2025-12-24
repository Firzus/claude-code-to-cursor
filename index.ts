import { getConfig, CLAUDE_CREDENTIALS_PATH } from "./src/config";
import { loadCredentials, getValidToken } from "./src/oauth";
import { proxyRequest } from "./src/anthropic-client";
import {
  openaiToAnthropic,
  anthropicToOpenai,
  createOpenAIStreamChunk,
  createOpenAIStreamStart,
  type OpenAIChatRequest,
} from "./src/openai-adapter";
import {
  getDb,
  getAnalytics,
  getBudgetSettings,
  updateBudgetSettings,
  getRecentRequests,
  type BudgetSettings,
} from "./src/db";
import { formatCost } from "./src/pricing";
import type { AnthropicRequest, AnthropicError } from "./src/types";

const config = getConfig();

async function checkCredentials(): Promise<boolean> {
  const creds = await loadCredentials();
  if (!creds?.claudeAiOauth) {
    console.log("\n⚠️  No Claude Code credentials found.");
    console.log(`   Expected at: ${CLAUDE_CREDENTIALS_PATH}`);
    console.log("   Run 'claude /login' to authenticate.\n");
    
    if (config.anthropicApiKey) {
      console.log("✓ Fallback ANTHROPIC_API_KEY is configured");
      return true;
    }
    
    console.log("⚠️  No ANTHROPIC_API_KEY fallback configured either.");
    return false;
  }
  
  console.log("✓ Claude Code credentials loaded");
  
  const token = await getValidToken();
  if (token) {
    const expiresIn = Math.round((token.expiresAt - Date.now()) / 1000 / 60);
    console.log(`  Token expires in ${expiresIn} minutes`);
  }
  
  if (config.anthropicApiKey) {
    console.log("✓ Fallback ANTHROPIC_API_KEY configured");
  } else {
    console.log("⚠️  No fallback ANTHROPIC_API_KEY (will fail if Claude Code limits hit)");
  }
  
  return true;
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

const server = Bun.serve({
  port: config.port,
  
  async fetch(req) {
    const url = new URL(req.url);
    
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta",
        },
      });
    }
    
    if (url.pathname === "/health" || url.pathname === "/") {
      const token = await getValidToken();
      return Response.json({
        status: "ok",
        claudeCode: {
          authenticated: !!token,
          expiresAt: token?.expiresAt,
        },
        fallback: !!config.anthropicApiKey,
      });
    }
    
    // Anthropic-compatible endpoint
    if (url.pathname === "/v1/messages" && req.method === "POST") {
      try {
        const body: AnthropicRequest = await req.json();
        const headers = extractHeaders(req);
        
        console.log(`\n→ ${body.model} | ${body.stream ? "stream" : "sync"} | max_tokens=${body.max_tokens}`);
        
        const response = await proxyRequest("/v1/messages", body, headers);
        
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
            error: { type: "invalid_request_error", message: String(error) } 
          } satisfies AnthropicError,
          { status: 400 }
        );
      }
    }
    
    // OpenAI-compatible endpoint
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      try {
        const openaiBody: OpenAIChatRequest = await req.json();
        const anthropicBody = openaiToAnthropic(openaiBody);
        const headers = extractHeaders(req);
        
        console.log(`\n→ [OpenAI] ${openaiBody.model} → ${anthropicBody.model} | ${anthropicBody.stream ? "stream" : "sync"} | max_tokens=${anthropicBody.max_tokens}`);
        
        const response = await proxyRequest("/v1/messages", anthropicBody, headers);
        
        const responseHeaders = new Headers();
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Content-Type", "application/json");
        
        // Handle streaming
        if (anthropicBody.stream && response.ok) {
          responseHeaders.set("Content-Type", "text/event-stream");
          responseHeaders.set("Cache-Control", "no-cache");
          responseHeaders.set("Connection", "keep-alive");
          
          const streamId = Date.now().toString();
          const reader = response.body?.getReader();
          
          if (!reader) {
            return Response.json({ error: { message: "No response body" } }, { status: 500 });
          }
          
          const stream = new ReadableStream({
            async start(controller) {
              const decoder = new TextDecoder();
              let buffer = "";
              let sentStart = false;
              
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() || "";
                  
                  for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = line.slice(6);
                    if (data === "[DONE]") {
                      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                      continue;
                    }
                    
                    try {
                      const event = JSON.parse(data);
                      
                      // Send start chunk with role
                      if (!sentStart) {
                        controller.enqueue(
                          new TextEncoder().encode(createOpenAIStreamStart(streamId, openaiBody.model))
                        );
                        sentStart = true;
                      }
                      
                      // Handle content_block_delta events
                      if (event.type === "content_block_delta" && event.delta?.text) {
                        controller.enqueue(
                          new TextEncoder().encode(
                            createOpenAIStreamChunk(streamId, openaiBody.model, event.delta.text)
                          )
                        );
                      }
                      
                      // Handle message_stop
                      if (event.type === "message_stop") {
                        controller.enqueue(
                          new TextEncoder().encode(
                            createOpenAIStreamChunk(streamId, openaiBody.model, undefined, "stop")
                          )
                        );
                        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                      }
                    } catch {
                      // Skip unparseable events
                    }
                  }
                }
              } finally {
                controller.close();
              }
            },
          });
          
          return new Response(stream, { headers: responseHeaders });
        }
        
        // Non-streaming response
        if (!response.ok) {
          const error = await response.json();
          return Response.json(
            { error: { message: error?.error?.message || "Unknown error", type: error?.error?.type } },
            { status: response.status, headers: responseHeaders }
          );
        }
        
        const anthropicResponse = await response.json();
        const openaiResponse = anthropicToOpenai(anthropicResponse, openaiBody.model);
        
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
          { id: "claude-sonnet-4-20250514", object: "model", created: 1700000000, owned_by: "anthropic" },
          { id: "claude-opus-4-20250514", object: "model", created: 1700000000, owned_by: "anthropic" },
          { id: "claude-3-5-sonnet-20241022", object: "model", created: 1700000000, owned_by: "anthropic" },
          { id: "claude-3-5-haiku-20241022", object: "model", created: 1700000000, owned_by: "anthropic" },
          { id: "gpt-4o", object: "model", created: 1700000000, owned_by: "openai-proxy" },
          { id: "gpt-4", object: "model", created: 1700000000, owned_by: "openai-proxy" },
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
    
    // Budget endpoints
    if (url.pathname === "/budget" && req.method === "GET") {
      const settings = getBudgetSettings();
      return Response.json(settings);
    }
    
    if (url.pathname === "/budget" && req.method === "POST") {
      try {
        const body = await req.json() as Partial<BudgetSettings>;
        updateBudgetSettings(body);
        return Response.json({ success: true, settings: getBudgetSettings() });
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 400 });
      }
    }
    
    return Response.json(
      { 
        type: "error", 
        error: { type: "not_found_error", message: `Unknown endpoint: ${url.pathname}` } 
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
console.log(`   OpenAI:     http://localhost:${server.port}/v1/chat/completions`);
console.log(`   Analytics:  http://localhost:${server.port}/analytics`);
console.log(`   Budget:     http://localhost:${server.port}/budget\n`);

await checkCredentials();

console.log("\n📋 Usage in Cursor/other clients:");
console.log(`   API Base URL: http://localhost:${server.port}`);
console.log("   API Key: (any value, e.g. 'proxy')\n");
