import type { NextRequest } from "next/server";
import { ipWhitelistGuard } from "~/lib/server/guard";
import { handleAnalyticsReset } from "~/lib/server/routes/analytics";

export async function POST(req: NextRequest) {
  const blocked = ipWhitelistGuard(req);
  if (blocked) return blocked;
  return handleAnalyticsReset();
}
