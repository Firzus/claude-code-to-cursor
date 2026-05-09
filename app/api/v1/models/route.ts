import type { NextRequest } from "next/server";
import { ipWhitelistGuard } from "~/lib/server/guard";
import { handleModels } from "~/lib/server/routes/models";


export async function GET(req: NextRequest) {
  const blocked = ipWhitelistGuard(req);
  if (blocked) return blocked;
  return handleModels();
}
