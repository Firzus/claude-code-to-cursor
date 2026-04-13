import { homedir } from "node:os";
import { join } from "node:path";
import type { ProxyConfig } from "./types";

// OAuth credentials persistence (own directory, not Claude Code's)
export const CCTC_AUTH_DIR = process.env.CCTC_AUTH_DIR || join(homedir(), ".cctc");
export const CCTC_AUTH_PATH = join(CCTC_AUTH_DIR, "auth.json");

export const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
export const ANTHROPIC_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
export const OAUTH_REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
export const OAUTH_SCOPES = "org:create_api_key user:profile user:inference";
export const ANTHROPIC_API_URL = "https://api.anthropic.com";
export const TUNNEL_URL = process.env.CLOUDFLARE_TUNNEL_URL || "";
// Required beta headers for Claude Code OAuth
const ANTHROPIC_BETA_OAUTH = "oauth-2025-04-20";
const ANTHROPIC_BETA_INTERLEAVED_THINKING = "interleaved-thinking-2025-05-14";

// Combined beta header string for Claude Code OAuth requests
// Note: context-1m header removed — 1M context is GA for Opus 4.6
export const CLAUDE_CODE_BETA_HEADERS = [
  ANTHROPIC_BETA_OAUTH,
  ANTHROPIC_BETA_INTERLEAVED_THINKING,
].join(",");

// Centralized User-Agent for all Claude Code requests
export const CLAUDE_CODE_USER_AGENT = "claude-cli/2.1.97 (external, cli)";

// System prompt prefix that identifies requests as coming from Claude Code
// This exact string is required for Claude Code OAuth to work - do not modify
export const CLAUDE_CODE_SYSTEM_PROMPT =
  "You are Claude Code, Anthropic's official CLI for Claude.";

// Additional instruction appended after the required prompt (optional)
export const CLAUDE_CODE_EXTRA_INSTRUCTION = process.env.CLAUDE_CODE_EXTRA_INSTRUCTION ?? "";

export function getConfig(): ProxyConfig {
  // IP whitelist for requests coming through the Cloudflare tunnel.
  // Set to "disabled" to allow all IPs.
  const allowedIPsEnv = process.env.ALLOWED_IPS || "52.44.113.131,184.73.225.134";
  const allowedIPs =
    allowedIPsEnv.trim().toLowerCase() === "disabled"
      ? []
      : allowedIPsEnv
          .split(",")
          .map((ip) => ip.trim())
          .filter(Boolean);

  // Build the allow-list of origins. Always include local dev URLs so the
  // dashboard works when accessed from the host machine, even when a tunnel
  // URL is configured for production.
  const frontendPort = process.env.FRONTEND_PORT || "3111";
  const localOrigins = [
    `http://localhost:${frontendPort}`,
    `http://127.0.0.1:${frontendPort}`,
  ];

  const explicit = (process.env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const tunnelOrigin = process.env.CLOUDFLARE_TUNNEL_URL?.trim() || "";

  const allowedOrigins = Array.from(
    new Set([...localOrigins, ...(tunnelOrigin ? [tunnelOrigin] : []), ...explicit]),
  );

  return {
    port: parseInt(process.env.PORT || "8082", 10),
    allowedIPs,
    allowedOrigins,
  };
}
