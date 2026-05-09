import { getEventLoopLag } from "~/lib/server/event-loop-monitor";
import { getRateLimitStatus } from "~/lib/server/anthropic-client";
import { getValidToken } from "~/lib/server/oauth";
import { getTunnelStatus } from "~/lib/server/tunnel-status";


export async function GET() {
  const tunnelUrl = process.env.CLOUDFLARE_TUNNEL_URL || undefined;
  // Probe cloudflared in parallel with the OAuth check — both are cheap and
  // we don't want the tunnel probe to add serial latency to /api/health.
  const [token, tunnel] = await Promise.all([getValidToken(), getTunnelStatus()]);
  const rateLimit = getRateLimitStatus();
  return Response.json({
    status: rateLimit.isLimited ? "rate_limited" : "ok",
    tunnelUrl,
    tunnel,
    claudeCode: {
      authenticated: !!token,
      expiresAt: token?.expiresAt,
    },
    rateLimit,
    eventLoopLag: getEventLoopLag(),
  });
}
