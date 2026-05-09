/**
 * Header-extraction helper shared by every RSC page. Cloudflare's
 * `cf-connecting-ip` is the canonical source; `x-forwarded-for` is the
 * fallback when running locally (no tunnel) or behind a different reverse
 * proxy. Value is forwarded to the Next.js Route Handlers so they can pass
 * the IP whitelist guard.
 */
export function getForwardedFor(incoming: Headers): string | undefined {
  return incoming.get("cf-connecting-ip") ?? incoming.get("x-forwarded-for") ?? undefined;
}
