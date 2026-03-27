import { proxyRequest } from "../anthropic-client";
import { logRequestDetails, corsHeaders } from "../middleware";
import { normalizeAnthropicRequestModel } from "../request-normalization";
import { parseModelId, getBudgetTokens } from "../model-parser";
import type { AnthropicRequest, AnthropicError } from "../types";

export async function handleAnthropicMessages(req: Request): Promise<Response> {
  try {
    logRequestDetails(req, "Anthropic /v1/messages");
    const incomingBody = (await req.json()) as AnthropicRequest;

    // Parse model name to extract base model and optional thinking effort
    const parsed = parseModelId(incomingBody.model);
    if (!parsed) {
      return Response.json(
        { type: "error", error: { type: "invalid_request_error", message: `Unsupported model: "${incomingBody.model}"` } },
        { status: 400 }
      );
    }
    const targetModel = parsed.baseModel;
    let body = normalizeAnthropicRequestModel(incomingBody, targetModel);

    // If thinking effort is encoded in the model name, override thinking budget
    if (parsed?.thinkingEffort) {
      const budget = getBudgetTokens(parsed.thinkingEffort);
      body = {
        ...body,
        thinking: { type: "enabled", budget_tokens: budget },
        temperature: 1,
        max_tokens: Math.max(body.max_tokens ?? 0, budget + 16384),
      };
    }

    console.log(
      `\n→ Model: "${incomingBody.model}" -> "${body.model}" | thinking=${body.thinking ? `${body.thinking.budget_tokens} tokens` : "none"} | ${body.stream ? "stream" : "sync"} | max_tokens=${body.max_tokens}`
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
