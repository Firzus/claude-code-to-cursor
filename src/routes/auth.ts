import {
  generatePKCE,
  getAuthorizationURL,
  exchangeCode,
} from "../oauth";
import { CCPROXY_AUTH_PATH } from "../config";
import { htmlResult, loginPage } from "../html-templates";

// PKCE state storage (module-level, TTL 10 min)
const pkceStore = new Map<
  string,
  { codeVerifier: string; createdAt: number }
>();
const PKCE_TTL_MS = 10 * 60 * 1000;

function cleanPkceStore() {
  const now = Date.now();
  for (const [key, val] of pkceStore) {
    if (now - val.createdAt > PKCE_TTL_MS) pkceStore.delete(key);
  }
}

export async function handleLogin(): Promise<Response> {
  cleanPkceStore();
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const state = crypto.randomUUID();
  pkceStore.set(state, { codeVerifier, createdAt: Date.now() });
  const authURL = getAuthorizationURL(codeChallenge, state);

  return new Response(loginPage(authURL, state), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function handleOAuthCallback(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const code = formData.get("code") as string | null;
    const state = formData.get("state") as string | null;

    if (!code || !state) {
      return new Response(htmlResult("Missing code or state parameter.", false), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    cleanPkceStore();
    const pkce = pkceStore.get(state);
    if (!pkce) {
      return new Response(
        htmlResult("Invalid or expired state. Please go back to /login and try again.", false),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
    pkceStore.delete(state);

    const auth = await exchangeCode(code, pkce.codeVerifier, state);
    const expiresIn = Math.round(
      (auth.expiresAt - Date.now()) / 1000 / 60
    );
    console.log(
      `✓ OAuth login successful — token expires in ${expiresIn} minutes`
    );

    return new Response(
      htmlResult(
        `Authentication successful! Token expires in ${expiresIn} minutes.<br>Credentials saved to <code>${CCPROXY_AUTH_PATH}</code>.<br>You can close this page.`,
        true
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return new Response(
      htmlResult(`Authentication failed: ${String(error)}`, false),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
