import { proxyRequest } from "../anthropic-client";
import { getModelSettings } from "../db";
import { logRequestDetails, corsHeaders } from "../middleware";
import { normalizeAnthropicRequestModel } from "../request-normalization";
import {
  getInvalidPublicModelMessage,
  getThinkingBudget,
  isAllowedPublicModel,
  PUBLIC_MODEL_ID,
} from "../model-settings";
import type { AnthropicRequest, AnthropicError, AnthropicResponse } from "../types";

function rewriteAnthropicJsonResponseModel(bodyText: string): string {
  try {
    const body = JSON.parse(bodyText) as AnthropicResponse | AnthropicError;
    if (body.type !== "message") {
      return bodyText;
    }

    return JSON.stringify({
      ...body,
      model: PUBLIC_MODEL_ID,
    } satisfies AnthropicResponse);
  } catch {
    return bodyText;
  }
}

function rewriteAnthropicSseLine(line: string): string {
  if (!line.startsWith("data: ")) {
    return line;
  }

  const data = line.slice("data: ".length);
  if (data === "[DONE]") {
    return line;
  }

  try {
    const event = JSON.parse(data) as {
      type?: string;
      message?: AnthropicResponse;
    };
    if (event.type !== "message_start" || !event.message) {
      return line;
    }

    return `data: ${JSON.stringify({
      ...event,
      message: {
        ...event.message,
        model: PUBLIC_MODEL_ID,
      },
    })}`;
  } catch {
    return line;
  }
}

function rewriteAnthropicSseResponseModel(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          let newlineIndex = buffer.indexOf("\n");
          while (newlineIndex !== -1) {
            const rawLine = buffer.slice(0, newlineIndex);
            const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
            controller.enqueue(encoder.encode(`${rewriteAnthropicSseLine(line)}\n`));
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf("\n");
          }
        }

        buffer += decoder.decode();
        if (buffer.length > 0) {
          controller.enqueue(encoder.encode(rewriteAnthropicSseLine(buffer)));
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

async function rewriteAnthropicResponseModel(response: Response): Promise<Response> {
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("Content-Length");
  responseHeaders.delete("Content-Encoding");

  const contentType = responseHeaders.get("Content-Type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const bodyText = await response.text();
    return new Response(rewriteAnthropicJsonResponseModel(bodyText), {
      status: response.status,
      headers: responseHeaders,
    });
  }

  if (contentType.includes("text/event-stream") && response.body) {
    return new Response(rewriteAnthropicSseResponseModel(response.body), {
      status: response.status,
      headers: responseHeaders,
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

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
    const normalizedBody = normalizeAnthropicRequestModel(incomingBody, targetModel);
    const {
      reasoning_budget: _clientReasoningBudget,
      thinking: _clientThinking,
      ...bodyWithoutClientThinkingControls
    } = normalizedBody;

    const body: AnthropicRequest =
      thinkingBudget === null
        ? {
            ...bodyWithoutClientThinkingControls,
            temperature: incomingBody.temperature,
            max_tokens: normalizedBody.max_tokens,
          }
        : {
            ...bodyWithoutClientThinkingControls,
            thinking: { type: "enabled" as const, budget_tokens: thinkingBudget },
            temperature: 1,
            max_tokens: Math.max(normalizedBody.max_tokens ?? 0, thinkingBudget + 16384),
          };

    console.log(
      `\n→ Model: "${incomingBody.model}" -> "${body.model}" | thinking=${body.thinking ? `${body.thinking.budget_tokens} tokens` : "none"} | ${body.stream ? "stream" : "sync"} | max_tokens=${body.max_tokens}`
    );

    const proxiedResponse = await proxyRequest("/v1/messages", body);
    const response = await rewriteAnthropicResponseModel(proxiedResponse);

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
