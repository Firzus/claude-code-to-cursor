import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware that blocks HTML requests coming through the Cloudflare
 * tunnel from non-whitelisted IPs.
 *
 * Trust model:
 * - Local access (`pnpm dev` on localhost:3111) carries no `cf-connecting-ip`
 *   header, so the middleware lets it through unconditionally — that's the
 *   only way the user reaches the dashboard.
 * - Tunnel access carries `cf-connecting-ip` injected by Cloudflare. We
 *   accept it only if the IP appears in `ALLOWED_IPS` (the same list the
 *   API routes use via `ipWhitelistGuard`), so Cursor BYOK traffic still
 *   hits `/api/v1/*` while random crawlers and visitors get a 403 on the
 *   HTML pages.
 *
 * The route handlers under `/api/*` keep their own `ipWhitelistGuard()` for
 * defense-in-depth and to return Anthropic-shaped error envelopes.
 */
export function middleware(req: NextRequest): NextResponse {
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (!cfConnectingIp) {
    // Local / no-tunnel request — let it through.
    return NextResponse.next();
  }

  const allowedIps = parseAllowedIps(process.env.ALLOWED_IPS);
  if (allowedIps === null || allowedIps.includes(cfConnectingIp)) {
    return NextResponse.next();
  }

  return new NextResponse("Forbidden", { status: 403 });
}

function parseAllowedIps(raw: string | undefined): string[] | null {
  // Mirror the parsing in `lib/server/config.ts`. `null` means "whitelist
  // disabled" (allow everything); an empty array would block everything.
  const value = (raw ?? "52.44.113.131,184.73.225.134").trim();
  if (value.toLowerCase() === "disabled") return null;
  return value
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

export const config = {
  // Run on every request EXCEPT static assets, Next internals, and the
  // public files that must remain reachable for crawler-control to work
  // (a robots.txt that returns 403 cannot tell bots to go away).
  matcher: ["/((?!_next/static|_next/image|robots.txt|sitemap.xml|favicon.ico).*)"],
};
