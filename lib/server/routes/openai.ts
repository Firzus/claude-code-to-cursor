import { proxyRequest } from "../anthropic-client";
import { getModelSettings, recordUsage } from "../db";
import {
  buildOpenAIError,
  createOpenAIErrorStream,
  parseResponseError,
  toErrorMessage,
} from "../error-utils";
import { logger } from "../logger";
import { corsHeaders, logRequestDetails } from "../middleware";
import { isValidThinkingEffort, type ThinkingEffort } from "../model-settings";
import {
  anthropicToOpenai,
  extractToolName,
  type OpenAIChatRequest,
  openaiToAnthropicBase,
} from "../openai-adapter";
import { computeRequestShape } from "../request-metrics";
import { applyThinkingToBody, pickRoute } from "../routing-policy";
import { createOpenAIStreamFromAnthropic } from "../stream-handler";
import type { AnthropicRequest, AnthropicResponse, ContentBlock } from "../types";
import { extractAnthropicUsage } from "../usage";

function stringifyContent(content: string | ContentBlock[] | null | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content);
  return content
    .map((block) =>
      block && typeof block === "object" && "type" in block && block.type === "text"
        ? block.text
        : JSON.stringify(block),
    )
    .join("\n");
}

function summarizeInputItem(item: unknown): string {
  if (typeof item === "string") return `string(${item.length})`;
  if (!item || typeof item !== "object") return typeof item;
  const o = item as Record<string, unknown>;
  const keys = Object.keys(o).join(",");
  const type = typeof o.type === "string" ? `type=${o.type}` : "no-type";
  const role = typeof o.role === "string" ? ` role=${o.role}` : "";
  const contentShape =
    typeof o.content === "string"
      ? ` content=string(${o.content.length})`
      : Array.isArray(o.content)
        ? ` content=array(${o.content.length})[${(o.content[0] as { type?: string } | undefined)?.type ?? "?"}]`
        : "";
  return `{${type}${role}${contentShape} keys=${keys}}`;
}

function describeMessageSource(openaiBody: OpenAIChatRequest): {
  count: number;
  source: "messages" | "input" | "none";
} {
  if (openaiBody.messages) return { count: openaiBody.messages.length, source: "messages" };
  if (openaiBody.input) {
    const count = Array.isArray(openaiBody.input) ? openaiBody.input.length : 0;
    return { count, source: "input" };
  }
  return { count: 0, source: "none" };
}

function summarizeToolItem(tool: unknown): string {
  const keys = tool && typeof tool === "object" ? Object.keys(tool).join(",") : typeof tool;
  const type =
    tool && typeof tool === "object" && "type" in tool ? (tool as { type?: string }).type : "?";
  return `{type=${type} keys=${keys}}`;
}

function logOpenAIRequest(openaiBody: OpenAIChatRequest): void {
  const { count: messageCount, source: messageSource } = describeMessageSource(openaiBody);
  logger.info(
    `[Cursor Request] model="${openaiBody.model}" stream=${openaiBody.stream || false} ${messageSource}=${messageCount} tools=${openaiBody.tools?.length ?? 0} max_tokens=${openaiBody.max_tokens || openaiBody.max_completion_tokens || "default"}`,
  );

  const sourceArr = openaiBody.messages ?? openaiBody.input;
  if (Array.isArray(sourceArr) && sourceArr.length > 0) {
    const sample = sourceArr.slice(0, 3).map(summarizeInputItem);
    logger.info(`[Cursor ${messageSource} sample] ${sample.join(" ")}`);
  } else if (typeof openaiBody.input === "string") {
    logger.info(`[Cursor input string] length=${openaiBody.input.length}`);
  }

  if (openaiBody.reasoning_effort) {
    logger.info(`Reasoning Effort: ${openaiBody.reasoning_effort}`);
  }

  if (openaiBody.messages && openaiBody.messages.length > 0) {
    logger.verbose(
      `[Cursor Messages] ${openaiBody.messages.length} msgs, roles: ${openaiBody.messages.map((m) => m.role).join(",")}`,
    );
  }

  if (openaiBody.tools && openaiBody.tools.length > 0) {
    const sample = openaiBody.tools.slice(0, 3).map(summarizeToolItem);
    logger.info(`[Cursor Tools] ${openaiBody.tools.length} tools, sample: ${sample.join(" ")}`);
  }
}

function logAnthropicConversion(
  openaiBody: OpenAIChatRequest,
  anthropicBody: AnthropicRequest,
): void {
  const thinkingEnabled = !!anthropicBody.thinking;
  const effort = anthropicBody.output_config?.effort ?? null;
  logger.info(
    `[OpenAI→Anthropic] "${openaiBody.model}" → "${anthropicBody.model}" | thinking=${thinkingEnabled ? `yes(${effort})` : "no"} | ${anthropicBody.stream ? "stream" : "sync"} | max_tokens=${anthropicBody.max_tokens}`,
  );

  if (anthropicBody.system) {
    const systemContent = stringifyContent(anthropicBody.system as string | ContentBlock[]);
    logger.verbose(`[Anthropic System Prompt] ${systemContent.length} chars`);
  }

  if (anthropicBody.messages && anthropicBody.messages.length > 0) {
    logger.verbose(`[Anthropic Messages] ${anthropicBody.messages.length} msgs`);
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates OpenAI→Anthropic conversion, thinking policy, and stream/sync branching in one handler.
export async function handleOpenAIChatCompletions(req: Request): Promise<Response> {
  try {
    logRequestDetails(req, "OpenAI /v1/chat/completions");
    const openaiBody = (await req.json()) as OpenAIChatRequest;
    const modelSettings = await getModelSettings();

    logOpenAIRequest(openaiBody);

    const clientEffort: ThinkingEffort | null = isValidThinkingEffort(openaiBody.reasoning_effort)
      ? openaiBody.reasoning_effort
      : null;

    const apiModelId = modelSettings.selectedModel;
    const converted = openaiToAnthropicBase(openaiBody, apiModelId);

    const shape = computeRequestShape(converted, "openai", clientEffort);

    const decision = pickRoute({ settings: modelSettings, clientEffort });

    if (modelSettings.thinkingEnabled) {
      logger.info(`[Thinking] effort=${decision.effort}, policy=${decision.policy}`);
    }

    const anthropicBody = applyThinkingToBody(
      converted,
      decision,
      openaiBody.max_tokens ?? openaiBody.max_completion_tokens,
      openaiBody.temperature,
      apiModelId,
    );

    logAnthropicConversion(openaiBody, anthropicBody);

    // performance.now() is monotonic; Date.now() can jump backward under
    // NTP correction or VM clock skew. Captured here so non-stream latency
    // measures the full upstream round-trip (parity with the stream path,
    // which captures right before stream consumption begins).
    const upstreamStartPerf = performance.now();
    const response = await proxyRequest("/v1/messages", anthropicBody);

    if (!response.ok) {
      const errorText = await response
        .clone()
        .text()
        .catch(() => "Unable to read error");
      logger.verbose(
        `[OpenAI] Error response (${response.status}): ${errorText.substring(0, 500)}`,
      );
    }

    const responseHeaders = new Headers(corsHeaders(req));
    responseHeaders.set("Content-Type", "application/json");

    // Handle streaming
    if (anthropicBody.stream) {
      responseHeaders.set("Content-Type", "text/event-stream");
      responseHeaders.set("Cache-Control", "no-cache");
      responseHeaders.set("Connection", "keep-alive");
      responseHeaders.set("X-Accel-Buffering", "no");

      const streamId = Date.now().toString();

      // Pre-stream error: emit as SSE so Cursor displays the message
      // instead of silently dropping the conversation.
      if (!response.ok) {
        const { message } = await parseResponseError(response);
        logger.error(`[SSE Error] Pre-stream failure for OpenAI route: ${message}`);
        const ssePayload = createOpenAIErrorStream(streamId, openaiBody.model, message);
        return new Response(new TextEncoder().encode(ssePayload), { headers: responseHeaders });
      }

      if (!response.body) {
        return Response.json(buildOpenAIError("api_error", "No response body"), { status: 500 });
      }

      let userToolNames: Set<string> | undefined;
      if (openaiBody.tools && openaiBody.tools.length > 0) {
        userToolNames = new Set<string>();
        for (const tool of openaiBody.tools) {
          const name = extractToolName(tool);
          if (name) userToolNames.add(name);
        }
      }

      const streamStartPerf = performance.now();
      const stream = createOpenAIStreamFromAnthropic(
        response,
        streamId,
        openaiBody.model,
        openaiBody.stream_options,
        userToolNames,
        (usage) => {
          recordUsage({
            usage,
            model: anthropicBody.model,
            appliedModel: anthropicBody.model,
            stream: true,
            latencyMs: Math.round(performance.now() - streamStartPerf),
            shape,
            decision,
          });
        },
      );

      return new Response(stream, { headers: responseHeaders });
    }

    // Non-streaming response
    if (!response.ok) {
      const { message, type } = await parseResponseError(response);
      logger.error(`Anthropic API error: ${message}`);
      return Response.json(
        { error: { message, type } },
        { status: response.status, headers: responseHeaders },
      );
    }

    const anthropicResponse = (await response.json()) as AnthropicResponse;
    const openaiResponse = anthropicToOpenai(anthropicResponse, openaiBody.model);

    recordUsage({
      usage: extractAnthropicUsage(anthropicResponse.usage),
      model: anthropicBody.model,
      appliedModel: anthropicBody.model,
      stream: false,
      latencyMs: Math.round(performance.now() - upstreamStartPerf),
      shape,
      decision,
    });

    return Response.json(openaiResponse, { headers: responseHeaders });
  } catch (error) {
    const stack = error instanceof Error && error.stack ? `\n${error.stack}` : "";
    const message = toErrorMessage(error);
    logger.error(`OpenAI request handling error: ${message}${stack}`);
    // Distinguish bad client JSON (400) from internal failures (500). Cursor
    // surfaces internal_error differently from invalid_request_error in its UI,
    // so reflecting the actual cause helps users diagnose stuck requests.
    if (error instanceof SyntaxError) {
      return Response.json(buildOpenAIError("invalid_request_error", message), { status: 400 });
    }
    return Response.json(buildOpenAIError("internal_error", "Request processing failed"), {
      status: 500,
    });
  }
}
