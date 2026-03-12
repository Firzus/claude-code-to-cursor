import { getConfig } from "./src/config";
import { hasCredentials, getValidToken } from "./src/oauth";
import { getDb } from "./src/db";
import { checkIPWhitelist, corsHeaders } from "./src/middleware";
import { handleAnthropicMessages } from "./src/routes/anthropic";
import { handleOpenAIChatCompletions } from "./src/routes/openai";
import { handleModels } from "./src/routes/models";
import {
  handleAnalytics,
  handleAnalyticsRequests,
  handleAnalyticsReset,
} from "./src/routes/analytics";
import { handleLogin, handleOAuthCallback } from "./src/routes/auth";
import { clearRateLimitCache, getRateLimitStatus } from "./src/anthropic-client";
import type { AnthropicError } from "./src/types";
import { logger } from "./src/logger";

const config = getConfig();

async function checkCredentials(): Promise<boolean> {
  if (!hasCredentials()) {
    console.log("\n⚠️  No OAuth credentials found.");
    console.log(
      `   >>> To authenticate: open http://localhost:${config.port}/login`
    );
    return false;
  }

  console.log("✓ OAuth credentials loaded");

  const token = await getValidToken();
  if (token) {
    const expiresIn = Math.round((token.expiresAt - Date.now()) / 1000 / 60);
    console.log(`  Token expires in ${expiresIn} minutes`);
  }

  return true;
}

// Global error handlers to prevent silent crashes
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
  idleTimeout: 255,

  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    logger.info(`[REQ] ${req.method} ${url.pathname}`);

    // IP whitelist for API endpoints
    if (
      url.pathname.startsWith("/v1/") ||
      url.pathname.startsWith("/analytics")
    ) {
      const ipCheck = checkIPWhitelist(req);
      if (!ipCheck.allowed) {
        return Response.json(
          {
            error: {
              type: "authentication_error",
              message: `Unauthorized: ${ipCheck.reason || "IP not whitelisted"}`,
            },
          },
          { status: 403 }
        );
      }
    }

    // --- Health check ---
    if (url.pathname === "/health" || url.pathname === "/") {
      const token = await getValidToken();
      const rateLimit = getRateLimitStatus();
      return Response.json({
        status: rateLimit.isLimited ? "rate_limited" : "ok",
        claudeCode: {
          authenticated: !!token,
          expiresAt: token?.expiresAt,
          ...(token ? {} : { loginUrl: `http://localhost:${config.port}/login` }),
        },
        rateLimit,
      });
    }

    // --- API routes ---
    if (url.pathname === "/v1/messages" && req.method === "POST") {
      return handleAnthropicMessages(req);
    }

    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      return handleOpenAIChatCompletions(req);
    }

    if (url.pathname === "/v1/models" && req.method === "GET") {
      return handleModels();
    }

    // --- Analytics ---
    if (url.pathname === "/analytics" && req.method === "GET") {
      return handleAnalytics(url);
    }

    if (url.pathname === "/analytics/requests" && req.method === "GET") {
      return handleAnalyticsRequests(url);
    }

    if (url.pathname === "/analytics/reset" && req.method === "POST") {
      return handleAnalyticsReset();
    }

    // --- Rate limit management ---
    if (url.pathname === "/rate-limit" && req.method === "GET") {
      return Response.json(getRateLimitStatus());
    }

    if (url.pathname === "/rate-limit/reset" && req.method === "POST") {
      const result = clearRateLimitCache();
      console.log(`Rate limit cache manually cleared (was limited: ${result.wasLimited})`);
      return Response.json(result);
    }

    // --- OAuth login flow ---
    if (url.pathname === "/login" && req.method === "GET") {
      return handleLogin();
    }

    if (url.pathname === "/oauth/callback" && req.method === "POST") {
      return handleOAuthCallback(req);
    }

    // --- 404 ---
    console.log(`[404] ${req.method} ${url.pathname}`);
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

// --- Bootstrap ---
console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Claude Code Proxy                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Proxy that routes requests through Claude Code OAuth.        ║
╚═══════════════════════════════════════════════════════════════╝
`);

getDb();

console.log(`🚀 Server running at http://localhost:${server.port}`);
console.log(`   Anthropic:  http://localhost:${server.port}/v1/messages`);
console.log(
  `   OpenAI:     http://localhost:${server.port}/v1/chat/completions`
);
console.log(`   Analytics:  http://localhost:${server.port}/analytics`);
console.log(`   Rate Limit: http://localhost:${server.port}/rate-limit`);
console.log(`   Login:      http://localhost:${server.port}/login\n`);

await checkCredentials();

console.log("\n📋 Usage in Cursor/other clients:");
console.log(`   API Base URL: http://localhost:${server.port}`);
console.log(`\n📝 Verbose logging enabled → api.log (gitignored)\n`);
