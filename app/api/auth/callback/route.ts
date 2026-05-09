import type { NextRequest } from "next/server";
import { ipWhitelistGuard } from "~/lib/server/guard";
import { handleOAuthCallbackAPI } from "~/lib/server/routes/auth";


export async function POST(req: NextRequest) {
  const blocked = ipWhitelistGuard(req);
  if (blocked) return blocked;
  return handleOAuthCallbackAPI(req);
}
