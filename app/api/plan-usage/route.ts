import type { NextRequest } from "next/server";
import { ipWhitelistGuard } from "~/lib/server/guard";
import { handlePlanUsage } from "~/lib/server/routes/plan-usage";


export async function GET(req: NextRequest) {
  const blocked = ipWhitelistGuard(req);
  if (blocked) return blocked;
  return handlePlanUsage();
}
