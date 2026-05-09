import "server-only";

import { checkIPWhitelist } from "./middleware";

/**
 * IP whitelist guard for proxy/admin endpoints.
 * Returns null if allowed, or a 403 Response if blocked. Mirrors the
 * inline check in the Bun version of index.ts.
 */
export function ipWhitelistGuard(req: Request): Response | null {
  const ipCheck = checkIPWhitelist(req);
  if (ipCheck.allowed) return null;

  return Response.json(
    {
      error: {
        type: "authentication_error",
        message: `Unauthorized: ${ipCheck.reason || "IP not whitelisted"}`,
      },
    },
    { status: 403 },
  );
}
