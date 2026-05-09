import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge proxy that blocks HTML requests coming through the Cloudflare tunnel
 * from non-whitelisted IPs. Local requests (no `cf-connecting-ip` header)
 * always pass. Tunnel requests pass only if the IP is in `ALLOWED_IPS`.
 *
 * `/api/*` routes keep their own `ipWhitelistGuard()` for defense-in-depth
 * and Anthropic-shaped error envelopes.
 */
export function proxy(req: NextRequest): NextResponse {
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
  // Run on HTML/page routes only. Exclusions:
  //   - `_next/static`, `_next/image` — Next internals
  //   - `robots.txt`, `sitemap.xml`, `favicon.ico` — must stay reachable so
  //     crawler-control signals can be served
  //   - `api/`, `v1/` — POST handlers hit a Next 16 + undici bug where the
  //     proxy's NextRequest disturbs the body stream. Skipping them is safe
  //     because each handler runs `ipWhitelistGuard()` itself.
  matcher: ["/((?!_next/static|_next/image|api/|v1/|robots.txt|sitemap.xml|favicon.ico).*)"],
};
