import { proxyRequest } from "../anthropic-client";
import { getModelSettings } from "../db";
import { logRequestDetails, corsHeaders } from "../middleware";
import { normalizeAnthropicRequestModel } from "../request-normalization";
import {
  getInvalidPublicModelMessage,
  getThinkingBudget,
  isAllowedPublicModel,
} from "../model-settings";
import type { AnthropicRequest, AnthropicError } from "../types";

export async function handleAnthropicMessages(req: Request): Promise<Response> {
  try {
    logRequestDetails(req, "Anthropic /v1/messages");
    const incomingBody = (await req.json()) as AnthropicRequest;
    const modelSettings = getModelSettings();

    if (!isAllowedPublicModel(incomingBody.model)) {
      return Response.json(
        {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: getInvalidPublicModelMessage(incomingBody.model),
          },
        },
        { status: 400 }
      );
    }
    const targetModel = modelSettings.selectedModel;
    const thinkingBudget = modelSettings.thinkingEnabled
      ? getThinkingBudget(modelSettings.thinkingEffort)
      : null;
    let body = normalizeAnthropicRequestModel(incomingBody, targetModel);

    body = {
      ...body,
      thinking:
        thinkingBudget === null
          ? undefined
          : { type: "enabled", budget_tokens: thinkingBudget },
      temperature: thinkingBudget === null ? incomingBody.temperature : 1,
      max_tokens:
        thinkingBudget === null
          ? body.max_tokens
          : Math.max(body.max_tokens ?? 0, thinkingBudget + 16384),
    };

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
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        type: "error",
        error: { type: "invalid_request_error", message },
      } satisfies AnthropicError,
      { status: 400 }
    );
  }
}
