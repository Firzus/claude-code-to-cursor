import type { NextRequest } from "next/server";
import { ipWhitelistGuard } from "~/lib/server/guard";
import { corsHeaders } from "~/lib/server/middleware";
import { handleAnthropicMessages } from "~/lib/server/routes/anthropic";


export async function POST(req: NextRequest) {
  const blocked = ipWhitelistGuard(req);
  if (blocked) return blocked;
  return handleAnthropicMessages(req);
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { headers: corsHeaders(req) });
}
