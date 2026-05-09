import { api } from "../../../convex/_generated/api";
import { convex } from "../convex";
import { toErrorMessage } from "../error-utils";
import { logger } from "../logger";
import {
  exchangeCode,
  generatePKCE,
  getAuthorizationURL,
  getValidToken,
  hasCredentials,
} from "../oauth";

// PKCE state is persisted in Convex (table `pkceState`). Mutations handle
// TTL eviction and atomic consumption — survives Next dev reloads and works
// across multiple processes.

export async function handleLoginAPI(): Promise<Response> {
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const state = crypto.randomUUID();
  await convex.mutation(api.pkceState.insert, { state, codeVerifier });
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

    // `consume` deletes the row atomically so a leaked state can't be replayed.
    const pkce = await convex.mutation(api.pkceState.consume, { state });
    if (!pkce) {
      return Response.json(
        { success: false, message: "Invalid or expired state. Please try again." },
        { status: 400 },
      );
    }

    const auth = await exchangeCode(code, pkce.codeVerifier, state);
    const expiresIn = Math.round((auth.expiresAt - Date.now()) / 1000 / 60);
    logger.info(`OAuth login successful — token expires in ${expiresIn} minutes`);

    return Response.json({ success: true, message: "Authentication successful.", expiresIn });
  } catch (error) {
    logger.error(`OAuth callback error: ${toErrorMessage(error)}`);
    return Response.json(
      { success: false, message: "Authentication failed. Please try again." },
      { status: 500 },
    );
  }
}

export async function handleAuthStatus(): Promise<Response> {
  const authenticated = await hasCredentials();
  const token = authenticated ? await getValidToken() : null;
  return Response.json({
    authenticated: !!token,
    expiresAt: token?.expiresAt ?? null,
  });
}
