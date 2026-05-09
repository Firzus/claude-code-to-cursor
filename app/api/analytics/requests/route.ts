import type { NextRequest } from "next/server";
import { ipWhitelistGuard } from "~/lib/server/guard";
import { handleAnalyticsRequests } from "~/lib/server/routes/analytics";


export async function GET(req: NextRequest) {
  const blocked = ipWhitelistGuard(req);
  if (blocked) return blocked;
  return handleAnalyticsRequests(new URL(req.url));
}
