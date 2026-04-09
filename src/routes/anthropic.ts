import { proxyRequest } from "../anthropic-client";
import { getModelSettings, recordRequest } from "../db";
import { logRequestDetails, corsHeaders } from "../middleware";
import { normalizeAnthropicRequestModel } from "../request-normalization";
import {
  getApiModelId,
  getInvalidPublicModelMessage,
  getThinkingBudget,
  isAllowedPublicModel,
  PUBLIC_MODEL_ID,
  THINKING_MAX_TOKENS_PADDING,
  type ThinkingEffort,
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
  onComplete?: (usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }) => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;

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

            // Extract token usage from SSE events
            if (line.startsWith("data: ") && onComplete) {
              try {
                const data = JSON.parse(line.slice(6)) as {
                  type?: string;
                  message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
                  usage?: { output_tokens?: number };
                };
                if (data.type === "message_start" && data.message?.usage) {
                  const u = data.message.usage;
                  cacheReadTokens = u.cache_read_input_tokens ?? 0;
                  cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
                  inputTokens = u.input_tokens ?? 0;
                }
                if (data.type === "message_delta" && data.usage?.output_tokens !== undefined) {
                  outputTokens = data.usage.output_tokens;
                }
              } catch {
                // ignore parse errors
              }
            }

            controller.enqueue(encoder.encode(`${rewriteAnthropicSseLine(line)}\n`));
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf("\n");
          }
        }

        buffer += decoder.decode();
        if (buffer.length > 0) {
          controller.enqueue(encoder.encode(rewriteAnthropicSseLine(buffer)));
        }

        onComplete?.({ inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens });
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

async function rewriteAnthropicResponseModel(
  response: Response,
  onStreamComplete?: (usage: { inputTokens: number; outputTokens: number }) => void,
): Promise<Response> {
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
    return new Response(rewriteAnthropicSseResponseModel(response.body, onStreamComplete), {
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
    const apiModel = getApiModelId(targetModel);
    // Respect client's reasoning_budget if it maps to a known effort level
    const clientEffort = typeof incomingBody.reasoning_budget === "string"
      && ["low", "medium", "high"].includes(incomingBody.reasoning_budget)
      ? incomingBody.reasoning_budget as ThinkingEffort
      : null;
    const effectiveEffort = clientEffort || modelSettings.thinkingEffort;
    const thinkingBudget = modelSettings.thinkingEnabled
      ? getThinkingBudget(effectiveEffort)
      : null;
    const normalizedBody = normalizeAnthropicRequestModel(incomingBody, apiModel);
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
            max_tokens: Math.max(normalizedBody.max_tokens ?? 0, thinkingBudget + THINKING_MAX_TOKENS_PADDING),
          };

    console.log(
      `\n→ Model: "${incomingBody.model}" -> "${body.model}" | thinking=${body.thinking ? `${body.thinking.budget_tokens} tokens` : "none"} | ${body.stream ? "stream" : "sync"} | max_tokens=${body.max_tokens}`
    );

    const proxiedResponse = await proxyRequest("/v1/messages", body);
    const streamStartTime = Date.now();
    const response = await rewriteAnthropicResponseModel(
      proxiedResponse,
      body.stream
        ? (usage) => {
            recordRequest({
              model: body.model,
              source: "claude_code",
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cacheReadTokens: usage.cacheReadTokens,
              cacheCreationTokens: usage.cacheCreationTokens,
              stream: true,
              latencyMs: Date.now() - streamStartTime,
            });
          }
        : undefined,
    );

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
