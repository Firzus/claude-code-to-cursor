import type { NextRequest } from "next/server";
import { clearRateLimitCache } from "~/lib/server/anthropic-client";
import { ipWhitelistGuard } from "~/lib/server/guard";
import { logger } from "~/lib/server/logger";


export async function POST(req: NextRequest) {
  const blocked = ipWhitelistGuard(req);
  if (blocked) return blocked;
  const result = clearRateLimitCache();
  logger.info(`Rate limit cache manually cleared (was limited: ${result.wasLimited})`);
  return Response.json(result);
}
