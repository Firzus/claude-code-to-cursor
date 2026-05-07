import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { serverEnv } from "~/lib/env";

/**
 * BFF proxy. Forwards client-initiated requests (SWR, fetch) to the Bun backend,
 * adding the x-settings-key header server-side so it is never exposed to the client.
 *
 * Mapping: /api/proxy/<rest> → ${BACKEND_URL}/api/<rest>
 */

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const search = req.nextUrl.search;
  const target = `${serverEnv.backendUrl}/api/${path.join("/")}${search}`;

  const incoming = await headers();
  const forwardedFor =
    incoming.get("cf-connecting-ip") ?? incoming.get("x-forwarded-for") ?? undefined;

  const reqHeaders = new Headers();
  reqHeaders.set("accept", "application/json");
  const contentType = req.headers.get("content-type");
  if (contentType) reqHeaders.set("content-type", contentType);
  if (serverEnv.settingsKey) reqHeaders.set("x-settings-key", serverEnv.settingsKey);
  if (forwardedFor) {
    reqHeaders.set("cf-connecting-ip", forwardedFor);
    reqHeaders.set("x-forwarded-for", forwardedFor);
  }

  const init: RequestInit = {
    method: req.method,
    headers: reqHeaders,
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) init.body = body;
  }

  const upstream = await fetch(target, init);
  const responseBody = await upstream.text();
  const response = new NextResponse(responseBody, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
  return response;
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const DELETE = forward;
export const PATCH = forward;
