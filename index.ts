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
  handleAnalyticsTimeline,
} from "./src/routes/analytics";
import {
  handleLoginAPI,
  handleOAuthCallbackAPI,
  handleAuthStatus,
} from "./src/routes/auth";
import {
  handleSettingsAPI,
  handleSettingsModelAPI,
} from "./src/routes/settings";
import { clearRateLimitCache, getRateLimitStatus } from "./src/anthropic-client";
import type { AnthropicError } from "./src/types";
import { logger } from "./src/logger";

const config = getConfig();

async function checkCredentials(): Promise<boolean> {
  if (!hasCredentials()) {
    console.log("\n⚠️  No OAuth credentials found.");
    console.log(
      "   >>> To authenticate: open the dashboard and go to the Auth page"
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

function printPortInUseHelp(port: number) {
  console.error(`\nPort ${port} is already in use.`);
  console.error(
    "Usually another ccproxy (bun) instance is still running, or another app bound this port."
  );
  console.error("\nTo free the port on Windows:");
  console.error(`  netstat -ano | findstr :${port}`);
  console.error(
    "  Then: taskkill /PID <pid> /F   or   Stop-Process -Id <pid> -Force"
  );
  console.error("\nOr use a different port: set PORT=8083 (or in .env)\n");
}

async function handleRequest(req: Request, url: URL): Promise<Response> {
  // IP whitelist for API endpoints
  if (
    url.pathname.startsWith("/v1/") ||
    url.pathname.startsWith("/analytics") ||
    url.pathname.startsWith("/api/analytics")
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
  if (url.pathname === "/health" || url.pathname === "/" || url.pathname === "/api/health") {
    const token = await getValidToken();
    const rateLimit = getRateLimitStatus();
    return Response.json({
      status: rateLimit.isLimited ? "rate_limited" : "ok",
      claudeCode: {
        authenticated: !!token,
        expiresAt: token?.expiresAt,
      },
      rateLimit,
    });
  }

  // --- Proxy API routes ---
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
  if ((url.pathname === "/analytics" || url.pathname === "/api/analytics") && req.method === "GET") {
    return handleAnalytics(url);
  }

  if ((url.pathname === "/analytics/requests" || url.pathname === "/api/analytics/requests") && req.method === "GET") {
    return handleAnalyticsRequests(url);
  }

  if ((url.pathname === "/analytics/timeline" || url.pathname === "/api/analytics/timeline") && req.method === "GET") {
    return handleAnalyticsTimeline(url);
  }

  if ((url.pathname === "/analytics/reset" || url.pathname === "/api/analytics/reset") && req.method === "POST") {
    return handleAnalyticsReset();
  }

  // --- Rate limit management ---
  if ((url.pathname === "/rate-limit" || url.pathname === "/api/rate-limit") && req.method === "GET") {
    return Response.json(getRateLimitStatus());
  }

  if ((url.pathname === "/rate-limit/reset" || url.pathname === "/api/rate-limit/reset") && req.method === "POST") {
    const result = clearRateLimitCache();
    console.log(`Rate limit cache manually cleared (was limited: ${result.wasLimited})`);
    return Response.json(result);
  }

  // --- Auth (JSON API) ---
  if (url.pathname === "/api/auth/login" && req.method === "GET") {
    return handleLoginAPI();
  }

  if (url.pathname === "/api/auth/callback" && req.method === "POST") {
    return handleOAuthCallbackAPI(req);
  }

  if (url.pathname === "/api/auth/status" && req.method === "GET") {
    return handleAuthStatus();
  }

  // --- Settings (JSON API) ---
  if (url.pathname === "/api/settings" && req.method === "GET") {
    return handleSettingsAPI(req);
  }

  if (url.pathname === "/api/settings/model" && req.method === "POST") {
    return handleSettingsModelAPI(req);
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
}

let server: ReturnType<typeof Bun.serve>;
try {
  server = Bun.serve({
    port: config.port,
    idleTimeout: 255,

    async fetch(req) {
      const url = new URL(req.url);

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }

      logger.info(`[REQ] ${req.method} ${url.pathname}`);

      // Handle request and add CORS headers to all responses
      const response = await handleRequest(req, url);
      const cors = corsHeaders();
      for (const [key, value] of Object.entries(cors)) {
        response.headers.set(key, value);
      }
      return response;
    },
  });
} catch (err) {
  const code = err instanceof Error && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
  if (code === "EADDRINUSE") {
    printPortInUseHelp(config.port);
    process.exit(1);
  }
  throw err;
}

// --- Bootstrap ---
console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Claude Code Proxy                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Proxy that routes requests through Claude Code OAuth.        ║
╚═══════════════════════════════════════════════════════════════╝
`);

getDb();

console.log(`🚀 Server listening on port ${server.port}`);
console.log(`   Anthropic:  /v1/messages`);
console.log(`   OpenAI:     /v1/chat/completions`);
console.log(`   Analytics:  /api/analytics`);
console.log(`   Settings:   /api/settings\n`);

await checkCredentials();

console.log(`\n📝 Verbose logging enabled → api.log (gitignored)\n`);
