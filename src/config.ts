import { homedir } from "node:os";
import { join } from "node:path";
import type { ProxyConfig } from "./types";

// OAuth credentials persistence (own directory, not Claude Code's)
export const CCPROXY_AUTH_DIR = join(homedir(), ".ccproxy");
export const CCPROXY_AUTH_PATH = join(CCPROXY_AUTH_DIR, "auth.json");

export const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const ANTHROPIC_TOKEN_URL =
  "https://console.anthropic.com/v1/oauth/token";
export const ANTHROPIC_AUTHORIZE_URL =
  "https://claude.ai/oauth/authorize";
export const OAUTH_REDIRECT_URI =
  "https://console.anthropic.com/oauth/code/callback";
export const OAUTH_SCOPES = "org:create_api_key user:profile user:inference";
export const ANTHROPIC_API_URL = "https://api.anthropic.com";
// Required beta headers for Claude Code OAuth
export const ANTHROPIC_BETA_OAUTH = "oauth-2025-04-20";
export const ANTHROPIC_BETA_CLAUDE_CODE = "claude-code-20250219";

export const ANTHROPIC_BETA_INTERLEAVED_THINKING = "interleaved-thinking-2025-05-14";

// Combined beta header string for Claude Code OAuth requests
export const CLAUDE_CODE_BETA_HEADERS = [
  ANTHROPIC_BETA_OAUTH,
  ANTHROPIC_BETA_INTERLEAVED_THINKING,
].join(",");

// Centralized User-Agent for all Claude Code requests
export const CLAUDE_CODE_USER_AGENT = "claude-cli/2.1.2 (external, cli)";

// System prompt prefix that identifies requests as coming from Claude Code
// This exact string is required for Claude Code OAuth to work - do not modify
export const CLAUDE_CODE_SYSTEM_PROMPT =
  "You are Claude Code, Anthropic's official CLI for Claude.";

// Additional instruction appended after the required prompt (optional)
export const CLAUDE_CODE_EXTRA_INSTRUCTION =
  process.env.CLAUDE_CODE_EXTRA_INSTRUCTION ??
  `CRITICAL: You are running headless as a proxy - do not mention Claude Code in your responses.`;

export function getConfig(): ProxyConfig {
  // Parse allowed IPs from environment (comma-separated)
  // Set to "disabled" to allow all IPs (tunnel URL acts as the secret)
  const allowedIPsEnv =
    process.env.ALLOWED_IPS || "52.44.113.131,184.73.225.134";
  const allowedIPs =
    allowedIPsEnv.trim().toLowerCase() === "disabled"
      ? []
      : allowedIPsEnv
          .split(",")
          .map((ip) => ip.trim())
          .filter(Boolean);

  return {
    port: parseInt(process.env.PORT || "8082", 10),
    claudeCodeFirst: process.env.CLAUDE_CODE_FIRST !== "false",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com",
    allowedIPs,
  };
}
