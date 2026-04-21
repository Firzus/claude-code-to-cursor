import { proxyRequest } from "../anthropic-client";
import { getModelSettings, recordRequest } from "../db";
import { createAnthropicErrorSSE, parseResponseError, toErrorMessage } from "../error-utils";
import { logger } from "../logger";
import { corsHeaders, logRequestDetails } from "../middleware";
import {
  getApiModelId,
  getInvalidPublicModelMessage,
  isAllowedPublicModel,
  isValidThinkingEffort,
  PUBLIC_MODEL_ID,
  type ThinkingEffort,
} from "../model-settings";
import { computeRequestShape } from "../request-metrics";
import { normalizeAnthropicRequestModel } from "../request-normalization";
import { applyThinkingToBody, pickRoute } from "../routing-policy";
import type { AnthropicError, AnthropicRequest, AnthropicResponse } from "../types";

function rewriteAnthropicJsonResponseModel(bodyText: string): string {
  try {
    const body = JSON.parse(bodyText) as AnthropicResponse | AnthropicError;
    if (body.type !== "message") {
      return bodyText;
    }

    return JSON.stringify({
      ...body,
      model: PUBLIC_MODEL_ID,
    } satisfies AnthropicResponse).replace(/"name"\s*:\s*"mcp_([^"]+)"/g, '"name": "$1"');
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
  onComplete?: (usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    thinkingTokens: number;
  }) => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let thinkingCharsAccum = 0;

  return new ReadableStream<Uint8Array>({
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: single-pass SSE rewriter with usage extraction — splitting would duplicate stream plumbing.
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
                  delta?: { type?: string; thinking?: string };
                  message?: {
                    usage?: {
                      input_tokens?: number;
                      cache_read_input_tokens?: number;
                      cache_creation_input_tokens?: number;
                    };
                  };
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
                if (data.type === "content_block_delta") {
                  const d = data.delta;
                  if (d?.type === "thinking_delta" && typeof d.thinking === "string") {
                    thinkingCharsAccum += d.thinking.length;
                  }
                }
              } catch {
                // ignore parse errors
              }
            }

            const rewritten = rewriteAnthropicSseLine(line).replace(
              /"name"\s*:\s*"mcp_([^"]+)"/g,
              '"name": "$1"',
            );
            controller.enqueue(encoder.encode(`${rewritten}\n`));
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf("\n");
          }
        }

        buffer += decoder.decode();
        if (buffer.length > 0) {
          controller.enqueue(encoder.encode(rewriteAnthropicSseLine(buffer)));
        }

        onComplete?.({
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          thinkingTokens: Math.ceil(thinkingCharsAccum / 4),
        });
        controller.close();
      } catch (error) {
        const errMsg = toErrorMessage(error);
        logger.error(`[Stream] Anthropic SSE rewriter failed: ${errMsg}`);
        try {
          controller.enqueue(encoder.encode(createAnthropicErrorSSE("api_error", errMsg)));
          controller.close();
        } catch {
          // Controller already closed or errored
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}

async function rewriteAnthropicResponseModel(
  response: Response,
  onStreamComplete?: (usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    thinkingTokens: number;
  }) => void,
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
        { status: 400 },
      );
    }
    // Respect client's reasoning_budget if it maps to a known effort level
    const clientEffort: ThinkingEffort | null = isValidThinkingEffort(incomingBody.reasoning_budget)
      ? incomingBody.reasoning_budget
      : null;

    // Normalize to default model placeholder first; routing-policy will set the real model
    const normalizedBody = normalizeAnthropicRequestModel(
      incomingBody,
      modelSettings.selectedModel,
    );
    const {
      reasoning_budget: _clientReasoningBudget,
      thinking: _clientThinking,
      output_config: _clientOutputConfig,
      ...bodyWithoutClientThinkingControls
    } = normalizedBody;

    const shape = computeRequestShape(
      bodyWithoutClientThinkingControls,
      "anthropic",
      typeof incomingBody.reasoning_budget === "string" ? incomingBody.reasoning_budget : null,
    );

    const decision = pickRoute({ settings: modelSettings, clientEffort });

    if (modelSettings.thinkingEnabled) {
      logger.info(`[Thinking] effort=${decision.effort}, policy=${decision.policy}`);
    }

    const body = applyThinkingToBody(
      bodyWithoutClientThinkingControls,
      decision,
      normalizedBody.max_tokens,
      incomingBody.temperature,
      getApiModelId(modelSettings.selectedModel),
    );

    logger.info(
      `Model: "${incomingBody.model}" -> "${body.model}" | thinking=${body.thinking?.type ?? "none"} | effort=${body.output_config?.effort ?? "none"} | policy=${decision.policy} | ${body.stream ? "stream" : "sync"} | max_tokens=${body.max_tokens}`,
    );

    const proxiedResponse = await proxyRequest("/v1/messages", body);

    // Pre-stream error: emit as SSE so the client sees the message
    // instead of a silent stream death.
    if (body.stream && !proxiedResponse.ok) {
      const { message, type } = await parseResponseError(proxiedResponse);
      logger.error(`[SSE Error] Pre-stream failure for Anthropic route: ${message}`);
      const responseHeaders = new Headers(corsHeaders(req));
      responseHeaders.set("Content-Type", "text/event-stream");
      responseHeaders.set("Cache-Control", "no-cache");
      return new Response(createAnthropicErrorSSE(type, message), { headers: responseHeaders });
    }

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
              thinkingTokens: usage.thinkingTokens,
              stream: true,
              latencyMs: Date.now() - streamStartTime,
              shape,
              decision,
              appliedModel: body.model,
            });
          }
        : undefined,
    );

    const responseHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(req))) {
      responseHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = toErrorMessage(error);
    logger.error(`Request handling error: ${message}`);
    return Response.json(
      {
        type: "error",
        error: { type: "invalid_request_error", message },
      } satisfies AnthropicError,
      { status: 400 },
    );
  }
}
