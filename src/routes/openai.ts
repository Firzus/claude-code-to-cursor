import { proxyRequest } from "../anthropic-client";
import { getModelSettings, recordRequest } from "../db";
import { createOpenAIErrorStream, parseResponseError, toErrorMessage } from "../error-utils";
import { logger } from "../logger";
import { corsHeaders, logRequestDetails } from "../middleware";
import { getApiModelId, isValidThinkingEffort, type ThinkingEffort } from "../model-settings";
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

function logOpenAIRequest(openaiBody: OpenAIChatRequest): void {
  const messageCount = openaiBody.messages?.length ?? openaiBody.input?.length ?? 0;
  const messageSource = openaiBody.messages
    ? "messages"
    : openaiBody.input
      ? "input"
      : "none";
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
    const sample = openaiBody.tools.slice(0, 3).map((t) => {
      const keys = t && typeof t === "object" ? Object.keys(t).join(",") : typeof t;
      const type = t && typeof t === "object" && "type" in t ? (t as { type?: string }).type : "?";
      return `{type=${type} keys=${keys}}`;
    });
    logger.info(
      `[Cursor Tools] ${openaiBody.tools.length} tools, sample: ${sample.join(" ")}`,
    );
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
    const modelSettings = getModelSettings();

    logOpenAIRequest(openaiBody);

    const clientEffort: ThinkingEffort | null = isValidThinkingEffort(openaiBody.reasoning_effort)
      ? openaiBody.reasoning_effort
      : null;

    const apiModelId = getApiModelId(modelSettings.selectedModel);
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
        return Response.json({ error: { message: "No response body" } }, { status: 500 });
      }

      let userToolNames: Set<string> | undefined;
      if (openaiBody.tools && openaiBody.tools.length > 0) {
        userToolNames = new Set<string>();
        for (const tool of openaiBody.tools) {
          const name = extractToolName(tool);
          if (name) userToolNames.add(name);
        }
      }

      const streamStartTime = Date.now();
      const stream = createOpenAIStreamFromAnthropic(
        response,
        streamId,
        openaiBody.model,
        openaiBody.stream_options,
        userToolNames,
        (usage) => {
          recordRequest({
            model: anthropicBody.model,
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
            appliedModel: anthropicBody.model,
          });
        },
      );

      return new Response(stream, { headers: responseHeaders });
    }

    // Non-streaming response
    if (!response.ok) {
      const error = (await response.json()) as {
        error?: { message?: string; type?: string };
      };
      const fullErrorMessage = error?.error?.message || "Unknown error";
      logger.error(`Anthropic API error: ${fullErrorMessage}`);
      return Response.json(
        {
          error: {
            message: "API request failed",
            type: error?.error?.type || "api_error",
          },
        },
        { status: response.status, headers: responseHeaders },
      );
    }

    const anthropicResponse = (await response.json()) as AnthropicResponse;
    const openaiResponse = anthropicToOpenai(anthropicResponse, openaiBody.model);

    return Response.json(openaiResponse, { headers: responseHeaders });
  } catch (error) {
    const stack = error instanceof Error && error.stack ? `\n${error.stack}` : "";
    logger.error(`OpenAI request handling error: ${toErrorMessage(error)}${stack}`);
    return Response.json(
      { error: { message: "Request processing failed", type: "invalid_request_error" } },
      { status: 400 },
    );
  }
}
