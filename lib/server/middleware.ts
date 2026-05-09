import { getConfig } from "./config";
import { logger } from "./logger";

const config = getConfig();

/**
 * Log detailed request information for debugging
 */
export function logRequestDetails(req: Request, endpoint: string) {
  const url = new URL(req.url);
  const cfConnectingIp = req.headers.get("cf-connecting-ip") || "none";
  logger.info(`[${endpoint}] ${req.method} ${url.pathname}${url.search} ip=${cfConnectingIp}`);

  const allHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    allHeaders[key] = value;
  });
  logger.verbose(`[${endpoint}] Headers: ${JSON.stringify(allHeaders)}`);
}

/**
 * Check if the request IP is in the whitelist.
 * All requests come through the Cloudflare tunnel; the client IP is
 * extracted from CF-Connecting-IP or X-Forwarded-For headers.
 */
export function checkIPWhitelist(req: Request): {
  allowed: boolean;
  ip?: string;
  reason?: string;
} {
  if (config.allowedIPs.length === 0) {
    return { allowed: true, ip: "all" };
  }

  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  const clientIP = cfConnectingIp || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  if (!clientIP) {
    return { allowed: false, reason: "No IP found in headers" };
  }

  const isAllowed = config.allowedIPs.includes(clientIP);

  if (!isAllowed) {
    logger.warn(`[SECURITY] Blocked IP: ${clientIP} (allowed: ${config.allowedIPs.join(", ")})`);
  }

  return {
    allowed: isAllowed,
    ip: clientIP,
    reason: isAllowed ? undefined : `IP ${clientIP} not in whitelist`,
  };
}

// Static portion of every CORS response. Built once at module load so per-
// request work is just the single dynamic `Access-Control-Allow-Origin` header.
const STATIC_CORS_HEADERS: Record<string, string> = {
  Vary: "Origin",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta, x-settings-key",
  "Access-Control-Allow-Credentials": "true",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

/**
 * Create CORS headers for responses.
 *
 * If the request's `Origin` header is in the allow-list, echo it back so the
 * browser accepts the response. If there's no Origin header at all (non-browser
 * client), fall back to the first configured origin so server-to-server tools
 * still work. Otherwise omit `Access-Control-Allow-Origin` entirely — returning
 * `*` here is invalid combined with `Allow-Credentials: true`, and echoing an
 * unknown origin would defeat the allow-list.
 */
export function corsHeaders(req?: Request): Record<string, string> {
  const requestOrigin = req?.headers.get("origin") ?? null;
  const allowed = config.allowedOrigins;

  if (requestOrigin && allowed.includes(requestOrigin)) {
    return { "Access-Control-Allow-Origin": requestOrigin, ...STATIC_CORS_HEADERS };
  }

  if (!requestOrigin && allowed[0]) {
    return { "Access-Control-Allow-Origin": allowed[0], ...STATIC_CORS_HEADERS };
  }

  return { ...STATIC_CORS_HEADERS };
}
