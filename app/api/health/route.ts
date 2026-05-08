import { getEventLoopLag } from "~/lib/server/event-loop-monitor";
import { getRateLimitStatus } from "~/lib/server/anthropic-client";
import { getValidToken } from "~/lib/server/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tunnelUrl = process.env.CLOUDFLARE_TUNNEL_URL || undefined;
  const token = await getValidToken();
  const rateLimit = getRateLimitStatus();
  return Response.json({
    status: rateLimit.isLimited ? "rate_limited" : "ok",
    tunnelUrl,
    claudeCode: {
      authenticated: !!token,
      expiresAt: token?.expiresAt,
    },
    rateLimit,
    eventLoopLag: getEventLoopLag(),
  });
}
