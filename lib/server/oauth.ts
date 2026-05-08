import "server-only";

import type { FunctionReference } from "convex/server";

import { internal } from "../../convex/_generated/api";
import {
  ANTHROPIC_AUTHORIZE_URL,
  ANTHROPIC_TOKEN_URL,
  CLAUDE_CLIENT_ID,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPES,
} from "./config";
import { convex } from "./convex";
import { toErrorMessage } from "./error-utils";
import { logger } from "./logger";
import type { CctcAuth, TokenInfo, TokenRefreshResponse } from "./types";

/** ConvexHttpClient typings only accept public mutation/query refs; OAuth uses internal functions. */
function asPublicMutation(
  ref: FunctionReference<"mutation", "internal">,
): FunctionReference<"mutation"> {
  return ref as unknown as FunctionReference<"mutation">;
}

function asPublicQuery(ref: FunctionReference<"query", "internal">): FunctionReference<"query"> {
  return ref as unknown as FunctionReference<"query">;
}

/**
 * Bridges generated `internal` when FilterApi resolves loosely under strict TS.
 * Function references match runtime (`api.js` exports `internal` as `anyApi`).
 */
const convexInternal = internal as unknown as {
  oauthTokens: {
    save: FunctionReference<"mutation", "internal">;
    get: FunctionReference<"query", "internal">;
    getStatus: FunctionReference<"query", "internal">;
  };
  pkceState: {
    create: FunctionReference<"mutation", "internal">;
    consume: FunctionReference<"mutation", "internal">;
  };
};

let cachedToken: TokenInfo | null = null;

// Coalesce concurrent token refreshes. Anthropic rotates the refresh_token
// on every call, so two parallel refreshes would race: one wins, the other
// fails with an invalid refresh_token. A single in-flight Promise lets all
// concurrent requests share the same outcome.
let refreshInFlight: Promise<TokenInfo | null> | null = null;

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return base64url(bytes);
}

async function computeCodeChallenge(verifier: string): Promise<string> {
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
  state: string,
): Promise<CctcAuth> {
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

  const auth: CctcAuth = {
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
// Persistence (Convex-backed)
// ---------------------------------------------------------------------------

async function saveCredentials(auth: CctcAuth): Promise<void> {
  await convex.mutation(asPublicMutation(convexInternal.oauthTokens.save), {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresAt: auth.expiresAt,
    scopes: auth.scopes,
    obtainedAt: auth.obtainedAt,
  });
}

async function loadCredentials(): Promise<CctcAuth | null> {
  try {
    const stored = await convex.query(asPublicQuery(convexInternal.oauthTokens.get), {});
    return stored;
  } catch (error) {
    logger.verbose(`[oauth] failed to load credentials: ${toErrorMessage(error)}`);
    return null;
  }
}

export async function hasCredentials(): Promise<boolean> {
  try {
    const status = await convex.query(asPublicQuery(convexInternal.oauthTokens.getStatus), {});
    return status.authenticated;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

async function refreshAccessToken(refreshTokenValue: string): Promise<TokenInfo | null> {
  try {
    logger.info("Refreshing OAuth token...");

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
      logger.error(`Token refresh failed: ${response.status} ${errorText}`);
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

    await saveCredentials({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scopes: (data.scope || OAUTH_SCOPES).split(" "),
      obtainedAt: now,
    });

    cachedToken = tokenInfo;
    logger.info("Token refreshed successfully");
    return tokenInfo;
  } catch (error) {
    logger.error(`Failed to refresh token: ${toErrorMessage(error)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main entry: get a valid token (cache → Convex → refresh)
// ---------------------------------------------------------------------------

export async function getValidToken(): Promise<TokenInfo | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken;
  }

  const auth = await loadCredentials();
  if (!auth) return null;

  if (Date.now() < auth.expiresAt) {
    cachedToken = {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: auth.expiresAt,
    };
    return cachedToken;
  }

  // Token expired → refresh, but coalesce so N concurrent callers share
  // a single network round-trip and a single rotated refresh_token.
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(auth.refreshToken).finally(() => {
      refreshInFlight = null;
    });
  }
  const refreshed = await refreshInFlight;
  if (refreshed) return refreshed;

  logger.error("Token refresh failed. Please re-authenticate via /login.");
  cachedToken = null;
  return null;
}

export function clearCachedToken(): void {
  cachedToken = null;
}

// ---------------------------------------------------------------------------
// PKCE state (Convex-backed)
// ---------------------------------------------------------------------------

export async function storePkceState(state: string, codeVerifier: string): Promise<void> {
  await convex.mutation(asPublicMutation(convexInternal.pkceState.create), {
    state,
    codeVerifier,
  });
}

export async function consumePkceState(state: string): Promise<string | null> {
  const result = await convex.mutation(asPublicMutation(convexInternal.pkceState.consume), {
    state,
  });
  return result?.codeVerifier ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
