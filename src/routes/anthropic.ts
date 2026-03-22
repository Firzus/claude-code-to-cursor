import { proxyRequest } from "../anthropic-client";
import { logRequestDetails, corsHeaders } from "../middleware";
import type { AnthropicRequest, AnthropicError } from "../types";

export async function handleAnthropicMessages(req: Request): Promise<Response> {
  try {
    logRequestDetails(req, "Anthropic /v1/messages");
    const body = (await req.json()) as AnthropicRequest;

    console.log(
      `\n→ Model: "${body.model}" | ${body.stream ? "stream" : "sync"} | max_tokens=${body.max_tokens}`
    );

    const response = await proxyRequest("/v1/messages", body);

    const responseHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders())) {
      responseHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Request handling error:", error);
    return Response.json(
      {
        type: "error",
        error: { type: "invalid_request_error", message: String(error) },
      } satisfies AnthropicError,
      { status: 400 }
    );
  }
}
