import { logger } from "../logger";
import {
  exchangeCode,
  generatePKCE,
  getAuthorizationURL,
  getValidToken,
  hasCredentials,
} from "../oauth";

// PKCE state storage (module-level, TTL 10 min, capped).
// Map iteration order is insertion order so the oldest entry is at the front
// — eviction when we hit the cap simply deletes the first entry.
const pkceStore = new Map<string, { codeVerifier: string; createdAt: number }>();
const PKCE_TTL_MS = 10 * 60 * 1000;
const PKCE_MAX_ENTRIES = 100;
const PKCE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let pkceCleanupTimer: ReturnType<typeof setInterval> | null = null;

function cleanPkceStore() {
  const now = Date.now();
  for (const [key, val] of pkceStore) {
    if (now - val.createdAt > PKCE_TTL_MS) pkceStore.delete(key);
  }
}

/**
 * Insert a new PKCE entry, evicting the oldest one when we reach the cap.
 * Combined with the periodic cleanup timer, this guarantees the map stays
 * bounded even under a flood of abandoned login flows.
 */
function insertPkceEntry(state: string, codeVerifier: string): void {
  if (pkceStore.size >= PKCE_MAX_ENTRIES) {
    const oldestKey = pkceStore.keys().next().value;
    if (oldestKey !== undefined) pkceStore.delete(oldestKey);
  }
  pkceStore.set(state, { codeVerifier, createdAt: Date.now() });
}

/**
 * Start a periodic background sweep of expired PKCE entries. Safe to call
 * multiple times (previous timer is cleared first).
 */
export function startPkceCleanup(intervalMs: number = PKCE_CLEANUP_INTERVAL_MS): void {
  stopPkceCleanup();
  pkceCleanupTimer = setInterval(cleanPkceStore, intervalMs);
}

/** Stop the periodic PKCE cleanup timer. */
export function stopPkceCleanup(): void {
  if (pkceCleanupTimer) {
    clearInterval(pkceCleanupTimer);
    pkceCleanupTimer = null;
  }
}

/** @internal for tests */
export function __getPkceStoreSize(): number {
  return pkceStore.size;
}

export async function handleLoginAPI(): Promise<Response> {
  cleanPkceStore();
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const state = crypto.randomUUID();
  insertPkceEntry(state, codeVerifier);
  const authURL = getAuthorizationURL(codeChallenge, state);

  return Response.json({ authURL, state });
}

export async function handleOAuthCallbackAPI(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { code, state } = body as { code?: string; state?: string };

    if (!code || !state) {
      return Response.json(
        { success: false, message: "Missing code or state parameter." },
        { status: 400 },
      );
    }

    cleanPkceStore();
    const pkce = pkceStore.get(state);
    if (!pkce) {
      return Response.json(
        { success: false, message: "Invalid or expired state. Please try again." },
        { status: 400 },
      );
    }
    pkceStore.delete(state);

    const auth = await exchangeCode(code, pkce.codeVerifier, state);
    const expiresIn = Math.round((auth.expiresAt - Date.now()) / 1000 / 60);
    console.log(`✓ OAuth login successful — token expires in ${expiresIn} minutes`);

    return Response.json({ success: true, message: "Authentication successful.", expiresIn });
  } catch (error) {
    const fullError = error instanceof Error ? error.message : String(error);
    logger.error(`OAuth callback error: ${fullError}`);
    return Response.json(
      { success: false, message: "Authentication failed. Please try again." },
      { status: 500 },
    );
  }
}

export async function handleAuthStatus(): Promise<Response> {
  const authenticated = hasCredentials();
  const token = authenticated ? await getValidToken() : null;
  return Response.json({
    authenticated: !!token,
    expiresAt: token?.expiresAt ?? null,
  });
}
