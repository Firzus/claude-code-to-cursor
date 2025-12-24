import {
  CLAUDE_CREDENTIALS_PATH,
  CLAUDE_CLIENT_ID,
  ANTHROPIC_TOKEN_URL,
} from "./config";
import type {
  ClaudeCredentials,
  TokenInfo,
  TokenRefreshResponse,
} from "./types";

let cachedToken: TokenInfo | null = null;

async function loadFromKeychain(): Promise<ClaudeCredentials | null> {
  try {
    const proc = Bun.spawn(
      [
        "security",
        "find-generic-password",
        "-a",
        Bun.env.USER || "",
        "-s",
        "Claude Code-credentials",
        "-w",
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !output.trim()) {
      return null;
    }

    return JSON.parse(output.trim());
  } catch {
    return null;
  }
}

async function loadFromFile(): Promise<ClaudeCredentials | null> {
  try {
    const file = Bun.file(CLAUDE_CREDENTIALS_PATH);
    if (!(await file.exists())) {
      return null;
    }
    return await file.json();
  } catch {
    return null;
  }
}

export async function loadCredentials(): Promise<ClaudeCredentials | null> {
  // Try Keychain first (macOS), then file fallback
  const keychainCreds = await loadFromKeychain();
  if (keychainCreds?.claudeAiOauth) {
    console.log("✓ Loaded credentials from macOS Keychain");
    return keychainCreds;
  }

  const fileCreds = await loadFromFile();
  if (fileCreds?.claudeAiOauth) {
    console.log("✓ Loaded credentials from file");
    return fileCreds;
  }

  console.error(
    `Credentials not found in Keychain or ${CLAUDE_CREDENTIALS_PATH}`
  );
  console.error("Please run 'claude /login' first to authenticate.");
  return null;
}

export function isTokenExpired(expiresAt: number): boolean {
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  return Date.now() >= expiresAt - bufferMs;
}

export async function refreshToken(
  refreshTokenValue: string
): Promise<TokenInfo | null> {
  try {
    console.log("Refreshing OAuth token...");

    const response = await fetch(ANTHROPIC_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshTokenValue,
        client_id: CLAUDE_CLIENT_ID,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Token refresh failed:", response.status, errorText);
      return null;
    }

    const data: TokenRefreshResponse = await response.json();
    const expiresAt = Date.now() + data.expires_in * 1000;

    const tokenInfo: TokenInfo = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      isExpired: false,
    };

    cachedToken = tokenInfo;

    console.log("Token refreshed successfully");
    return tokenInfo;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return null;
  }
}

export async function getValidToken(): Promise<TokenInfo | null> {
  if (cachedToken && !isTokenExpired(cachedToken.expiresAt)) {
    return cachedToken;
  }

  const credentials = await loadCredentials();
  if (!credentials?.claudeAiOauth) {
    return null;
  }

  const {
    accessToken,
    refreshToken: storedRefreshToken,
    expiresAt,
  } = credentials.claudeAiOauth;

  if (isTokenExpired(expiresAt)) {
    return await refreshToken(storedRefreshToken);
  }

  cachedToken = {
    accessToken,
    refreshToken: storedRefreshToken,
    expiresAt,
    isExpired: false,
  };

  return cachedToken;
}

export function clearCachedToken(): void {
  cachedToken = null;
}
