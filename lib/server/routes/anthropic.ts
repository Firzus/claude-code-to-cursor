import { proxyRequest } from "../anthropic-client";
import { getModelSettings, recordUsage } from "../db";
import {
  buildAnthropicError,
  createAnthropicErrorSSE,
  parseResponseError,
  toErrorMessage,
} from "../error-utils";
import { logger } from "../logger";
import { corsHeaders, logRequestDetails } from "../middleware";
import {
  getInvalidPublicModelMessage,
  isAllowedPublicModel,
  isValidThinkingEffort,
  type ThinkingEffort,
} from "../model-settings";
import { computeRequestShape } from "../request-metrics";
import { normalizeAnthropicRequestModel, TOOL_PREFIX } from "../request-normalization";
import { applyThinkingToBody, pickRoute } from "../routing-policy";
import type { AnthropicError, AnthropicRequest, AnthropicResponse } from "../types";
import { type AnthropicUsageSnapshot, extractAnthropicUsage } from "../usage";

const MCP_TOOL_NAME_JSON_REGEX = new RegExp(`"name"\\s*:\\s*"${TOOL_PREFIX}([^"]+)"`, "g");

function stripMcpToolNamesInJson(json: string): string {
  return json.replace(MCP_TOOL_NAME_JSON_REGEX, '"name": "$1"');
}

function rewriteAnthropicJsonResponseModel(bodyText: string, clientModel: string): string {
  try {
    const body = JSON.parse(bodyText) as AnthropicResponse | AnthropicError;
    if (body.type !== "message") {
      return bodyText;
    }

    return stripMcpToolNamesInJson(
      JSON.stringify({
        ...body,
        model: clientModel,
      } satisfies AnthropicResponse),
    );
  } catch (err) {
    logger.verbose(`[Anthropic] JSON response not parseable, passing through: ${toErrorMessage(err)}`);
    return bodyText;
  }
}

function rewriteAnthropicSseLine(line: string, clientModel: string): string {
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
        model: clientModel,
      },
    })}`;
  } catch (err) {
    logger.verbose(`[Anthropic] SSE line not parseable, passing through: ${toErrorMessage(err)}`);
    return line;
  }
}

function rewriteAnthropicSseResponseModel(
  body: ReadableStream<Uint8Array>,
  clientModel: string,
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
  let parseFailures = 0;

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
                parseFailures++;
              }
            }

            const rewritten = stripMcpToolNamesInJson(rewriteAnthropicSseLine(line, clientModel));
            controller.enqueue(encoder.encode(`${rewritten}\n`));
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf("\n");
          }
        }

        buffer += decoder.decode();
        if (buffer.length > 0) {
          controller.enqueue(encoder.encode(rewriteAnthropicSseLine(buffer, clientModel)));
        }

        if (parseFailures > 0) {
          logger.verbose(
            `[Anthropic] SSE rewriter: ${parseFailures} unparseable event(s) skipped`,
          );
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
        } catch (closeErr) {
          logger.verbose(`[Stream] controller already closed: ${toErrorMessage(closeErr)}`);
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}

function extractJsonUsage(bodyText: string): AnthropicUsageSnapshot | null {
  try {
    const parsed = JSON.parse(bodyText) as { usage?: AnthropicResponse["usage"] };
    return parsed.usage ? extractAnthropicUsage(parsed.usage) : null;
  } catch {
    return null;
  }
}

async function rewriteAnthropicResponseModel(
  response: Response,
  clientModel: string,
  onComplete?: (usage: AnthropicUsageSnapshot) => void,
): Promise<Response> {
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("Content-Length");
  responseHeaders.delete("Content-Encoding");

  const contentType = responseHeaders.get("Content-Type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const bodyText = await response.text();
    if (onComplete && response.ok) {
      const usage = extractJsonUsage(bodyText);
      if (usage) onComplete(usage);
    }
    return new Response(rewriteAnthropicJsonResponseModel(bodyText, clientModel), {
      status: response.status,
      headers: responseHeaders,
    });
  }

  if (contentType.includes("text/event-stream") && response.body) {
    return new Response(rewriteAnthropicSseResponseModel(response.body, clientModel, onComplete), {
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
    const modelSettings = await getModelSettings();

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
      modelSettings.selectedModel,
    );

    logger.info(
      `Model: "${incomingBody.model}" -> "${body.model}" | thinking=${body.thinking?.type ?? "none"} | effort=${body.output_config?.effort ?? "none"} | policy=${decision.policy} | ${body.stream ? "stream" : "sync"} | max_tokens=${body.max_tokens}`,
    );

    // performance.now() is monotonic; Date.now() can jump backward under
    // NTP correction or VM clock skew, producing negative latency rows.
    const upstreamStartPerf = performance.now();
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

    const response = await rewriteAnthropicResponseModel(
      proxiedResponse,
      incomingBody.model,
      (usage) => {
        recordUsage({
          usage,
          model: body.model,
          appliedModel: body.model,
          stream: body.stream || false,
          latencyMs: Math.round(performance.now() - upstreamStartPerf),
          shape,
          decision,
        });
      },
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
    return Response.json(buildAnthropicError("invalid_request_error", message), { status: 400 });
  }
}
