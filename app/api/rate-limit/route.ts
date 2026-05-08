import type { NextRequest } from "next/server";
import { getRateLimitStatus } from "~/lib/server/anthropic-client";
import { ipWhitelistGuard } from "~/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = ipWhitelistGuard(req);
  if (blocked) return blocked;
  return Response.json(getRateLimitStatus());
}
