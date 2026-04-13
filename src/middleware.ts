import { getConfig } from "./config";
import { logger } from "./logger";

const config = getConfig();

/**
 * Log detailed request information for debugging
 */
export function logRequestDetails(req: Request, endpoint: string) {
  const url = new URL(req.url);
  const userAgent = req.headers.get("user-agent") || "unknown";
  const origin = req.headers.get("origin") || "none";
  const referer = req.headers.get("referer") || "none";
  const cfRay = req.headers.get("cf-ray") || "none";
  const cfConnectingIp = req.headers.get("cf-connecting-ip") || "none";
  const xForwardedFor = req.headers.get("x-forwarded-for") || "none";
  const xRealIp = req.headers.get("x-real-ip") || "none";

  const anthropicBeta = req.headers.get("anthropic-beta") || "none";

  console.log(`\n📥 [${endpoint}] Request Details:`);
  console.log(`   User-Agent: ${userAgent}`);
  console.log(`   Origin: ${origin}`);
  console.log(`   Referer: ${referer}`);
  console.log(`   CF-Ray: ${cfRay}`);
  console.log(`   CF-Connecting-IP: ${cfConnectingIp} (Cursor backend server)`);
  console.log(`   X-Forwarded-For: ${xForwardedFor}`);
  console.log(`   X-Real-IP: ${xRealIp}`);
  console.log(`   Anthropic-Beta: ${anthropicBeta}`);
  console.log(`   URL: ${url.pathname}${url.search}`);
  console.log(`   Method: ${req.method}`);

  // Log all headers to file only (verbose)
  const allHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    allHeaders[key] = value;
  });
  logger.verbose(`   All Headers: ${JSON.stringify(allHeaders, null, 2)}`);
}

/**
 * Extract Anthropic-specific headers from the request
 */
export function extractHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const passthrough = ["anthropic-version", "anthropic-beta"];

  for (const key of passthrough) {
    const value = req.headers.get(key);
    if (value) headers[key] = value;
  }

  if (!headers["anthropic-version"]) {
    headers["anthropic-version"] = "2023-06-01";
  }

  return headers;
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
    const cfRay = req.headers.get("cf-ray") || "none";
    console.log(`\n🚫 [SECURITY] Blocked request from unauthorized IP: ${clientIP}`);
    console.log(`   Allowed IPs: ${config.allowedIPs.join(", ")}`);
    console.log(`   CF-Ray: ${cfRay}`);
  }

  return {
    allowed: isAllowed,
    ip: clientIP,
    reason: isAllowed ? undefined : `IP ${clientIP} not in whitelist`,
  };
}

/**
 * Create CORS headers for responses.
 *
 * If the request's `Origin` header is in the allow-list, echo it back so the
 * browser accepts the response. Otherwise fall back to the first configured
 * origin (preserves backward-compat for non-browser clients).
 */
export function corsHeaders(req?: Request): Record<string, string> {
  const requestOrigin = req?.headers.get("origin") ?? null;
  const allowed = config.allowedOrigins;
  const origin =
    requestOrigin && allowed.includes(requestOrigin) ? requestOrigin : (allowed[0] ?? "*");

  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta, x-settings-key",
    "Access-Control-Allow-Credentials": "true",
  };
}
