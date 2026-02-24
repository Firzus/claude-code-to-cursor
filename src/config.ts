import { homedir } from "node:os";
import { join } from "node:path";
import type { ProxyConfig } from "./types";

export const CLAUDE_CREDENTIALS_PATH = join(
  homedir(),
  ".claude",
  ".credentials.json"
);
export const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const ANTHROPIC_TOKEN_URL =
  "https://console.anthropic.com/v1/oauth/token";
export const ANTHROPIC_API_URL = "https://api.anthropic.com";
// Required beta headers for Claude Code OAuth
export const ANTHROPIC_BETA_OAUTH = "oauth-2025-04-20";
export const ANTHROPIC_BETA_CLAUDE_CODE = "claude-code-20250219";

// Combined beta header string for Claude Code OAuth requests (minimal required set)
export const CLAUDE_CODE_BETA_HEADERS = [
  ANTHROPIC_BETA_CLAUDE_CODE,
  ANTHROPIC_BETA_OAUTH,
].join(",");

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
