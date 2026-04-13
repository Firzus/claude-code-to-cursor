import {
  exchangeCode,
  generatePKCE,
  getAuthorizationURL,
  getValidToken,
  hasCredentials,
} from "../oauth";

// PKCE state storage (module-level, TTL 10 min)
const pkceStore = new Map<string, { codeVerifier: string; createdAt: number }>();
const PKCE_TTL_MS = 10 * 60 * 1000;

function cleanPkceStore() {
  const now = Date.now();
  for (const [key, val] of pkceStore) {
    if (now - val.createdAt > PKCE_TTL_MS) pkceStore.delete(key);
  }
}

export async function handleLoginAPI(): Promise<Response> {
  cleanPkceStore();
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const state = crypto.randomUUID();
  pkceStore.set(state, { codeVerifier, createdAt: Date.now() });
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
    console.error("OAuth callback error:", error);
    return Response.json(
      { success: false, message: `Authentication failed: ${String(error)}` },
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
