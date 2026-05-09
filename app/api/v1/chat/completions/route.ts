import type { NextRequest } from "next/server";
import { ipWhitelistGuard } from "~/lib/server/guard";
import { corsHeaders } from "~/lib/server/middleware";
import { handleOpenAIChatCompletions } from "~/lib/server/routes/openai";

export async function POST(req: NextRequest) {
  const blocked = ipWhitelistGuard(req);
  if (blocked) return blocked;
  return handleOpenAIChatCompletions(req);
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { headers: corsHeaders(req) });
}
