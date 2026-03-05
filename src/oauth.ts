import { mkdirSync } from "node:fs";
import {
  CCPROXY_AUTH_DIR,
  CCPROXY_AUTH_PATH,
  CLAUDE_CLIENT_ID,
  ANTHROPIC_TOKEN_URL,
  ANTHROPIC_AUTHORIZE_URL,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPES,
} from "./config";
import type { CcproxyAuth, TokenInfo, TokenRefreshResponse } from "./types";

let cachedToken: TokenInfo | null = null;

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return base64url(bytes);
}

export async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64url(new Uint8Array(digest));
}

export async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}

export function getAuthorizationURL(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    code: "true",
    client_id: CLAUDE_CLIENT_ID,
    response_type: "code",
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: OAUTH_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
  return `${ANTHROPIC_AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  state: string
): Promise<CcproxyAuth> {
  // Anthropic may return code in format "code#state" — strip the fragment
  const cleanCode = code.includes("#") ? code.split("#")[0] : code;

  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: cleanCode,
      client_id: CLAUDE_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: codeVerifier,
      state,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as TokenRefreshResponse;
  const now = Date.now();

  const auth: CcproxyAuth = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + data.expires_in * 1000,
    scopes: (data.scope || OAUTH_SCOPES).split(" "),
    obtainedAt: now,
  };

  await saveCredentials(auth);

  cachedToken = {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresAt: auth.expiresAt,
  };

  return auth;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function saveCredentials(auth: CcproxyAuth): Promise<void> {
  mkdirSync(CCPROXY_AUTH_DIR, { recursive: true });
  await Bun.write(CCPROXY_AUTH_PATH, JSON.stringify(auth, null, 2));
}

export async function loadCredentials(): Promise<CcproxyAuth | null> {
  try {
    const file = Bun.file(CCPROXY_AUTH_PATH);
    if (!(await file.exists())) return null;
    return (await file.json()) as CcproxyAuth;
  } catch {
    return null;
  }
}

export function hasCredentials(): boolean {
  try {
    return require("node:fs").existsSync(CCPROXY_AUTH_PATH);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

export async function refreshAccessToken(
  refreshTokenValue: string
): Promise<TokenInfo | null> {
  try {
    console.log("Refreshing OAuth token...");

    const response = await fetch(ANTHROPIC_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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

    const data = (await response.json()) as TokenRefreshResponse;
    const now = Date.now();
    const expiresAt = now + data.expires_in * 1000;

    const tokenInfo: TokenInfo = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    };

    // Persist rotated tokens to disk
    await saveCredentials({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scopes: (data.scope || OAUTH_SCOPES).split(" "),
      obtainedAt: now,
    });

    cachedToken = tokenInfo;
    console.log("Token refreshed successfully");
    return tokenInfo;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main entry: get a valid token (cache → disk → refresh)
// ---------------------------------------------------------------------------

export async function getValidToken(): Promise<TokenInfo | null> {
  // 1. Memory cache valid → return
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken;
  }

  // 2. Read from disk
  const auth = await loadCredentials();
  if (!auth) return null;

  // 3. Disk token not expired → cache and return
  if (Date.now() < auth.expiresAt) {
    cachedToken = {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: auth.expiresAt,
    };
    return cachedToken;
  }

  // 4. Token expired → refresh inline
  const refreshed = await refreshAccessToken(auth.refreshToken);
  if (refreshed) return refreshed;

  // 5. Refresh failed → null
  console.error("Token refresh failed. Please re-authenticate via /login.");
  cachedToken = null;
  return null;
}

export function clearCachedToken(): void {
  cachedToken = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
