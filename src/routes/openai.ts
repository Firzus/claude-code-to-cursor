import { proxyRequest } from "../anthropic-client";
import { getModelSettings, recordRequest } from "../db";
import { logger } from "../logger";
import { corsHeaders, logRequestDetails } from "../middleware";
import { getApiModelId, isValidThinkingEffort, type ThinkingEffort } from "../model-settings";
import {
  anthropicToOpenai,
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

function indentBlock(text: string, prefix = "      "): string {
  return text
    .split("\n")
    .map((l: string) => `${prefix}${l}`)
    .join("\n");
}

function logOpenAIRequest(openaiBody: OpenAIChatRequest): void {
  console.log(
    `\n📋 [Cursor Request] model="${openaiBody.model}" stream=${openaiBody.stream || false} messages=${openaiBody.messages?.length || 0} max_tokens=${openaiBody.max_tokens || openaiBody.max_completion_tokens || "default"}`,
  );

  if (openaiBody.reasoning_effort) {
    console.log(`   Reasoning Effort: ${openaiBody.reasoning_effort}`);
  }

  logger.verbose(`\n🔍 [FULL Cursor Request Body]:`);
  logger.verbose(JSON.stringify(openaiBody, null, 2));

  if (openaiBody.messages && openaiBody.messages.length > 0) {
    logger.verbose(`\n📝 [Cursor Messages]:`);
    openaiBody.messages.forEach((msg, idx) => {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      logger.verbose(`   [${idx}] ${msg.role} (${content.length} chars):`);
      logger.verbose(`   ${indentBlock(content)}`);
    });
  }
}

function logAnthropicConversion(
  openaiBody: OpenAIChatRequest,
  anthropicBody: AnthropicRequest,
): void {
  const thinkingEnabled = !!anthropicBody.thinking;
  const effort = anthropicBody.output_config?.effort ?? null;
  const routeSummary = `[OpenAI→Anthropic] Cursor model: "${openaiBody.model}" → API model: "${anthropicBody.model}" | thinking: ${thinkingEnabled ? `yes (effort=${effort})` : "no"} | ${anthropicBody.stream ? "stream" : "sync"} | max_tokens=${anthropicBody.max_tokens}`;
  console.log(`\n→ ${routeSummary}`);
  logger.info(routeSummary);

  if (anthropicBody.system) {
    const systemContent = stringifyContent(anthropicBody.system as string | ContentBlock[]);
    logger.verbose(`\n📋 [Anthropic System Prompt] (${systemContent.length} chars):`);
    logger.verbose(indentBlock(systemContent, "   "));
  }

  if (anthropicBody.messages && anthropicBody.messages.length > 0) {
    logger.verbose(`\n📨 [Anthropic Messages] (${anthropicBody.messages.length}):`);
    anthropicBody.messages.forEach((msg, idx) => {
      const content = stringifyContent(msg.content);
      logger.verbose(`   [${idx}] ${msg.role} (${content.length} chars):`);
      logger.verbose(`   ${indentBlock(content)}`);
    });
  }

  console.log(`\n📤 [Prepared Request Summary]:`);
  console.log(`   System prompt present: ${!!anthropicBody.system}`);
  if (anthropicBody.system) {
    const sysPreview =
      typeof anthropicBody.system === "string"
        ? anthropicBody.system.substring(0, 100)
        : `array (${(anthropicBody.system as ContentBlock[]).length} blocks)`;
    console.log(`   System type: ${typeof anthropicBody.system}, preview: ${sysPreview}...`);
  }
}

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

    console.log(`   [Debug] Response status: ${response.status}, ok: ${response.ok}`);

    if (!response.ok) {
      const errorText = await response
        .clone()
        .text()
        .catch(() => "Unable to read error");
      console.log(`   [Debug] Error response: ${errorText.substring(0, 500)}`);
    }

    logger.verbose(
      `   [Debug] Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`,
    );

    const responseHeaders = new Headers(corsHeaders(req));
    responseHeaders.set("Content-Type", "application/json");

    // Handle streaming
    if (anthropicBody.stream && response.ok) {
      responseHeaders.set("Content-Type", "text/event-stream");
      responseHeaders.set("Cache-Control", "no-cache");
      responseHeaders.set("Connection", "keep-alive");
      responseHeaders.set("X-Accel-Buffering", "no");

      const streamId = Date.now().toString();

      if (!response.body) {
        return Response.json({ error: { message: "No response body" } }, { status: 500 });
      }

      let userToolNames: Set<string> | undefined;
      if (openaiBody.tools && openaiBody.tools.length > 0) {
        userToolNames = new Set<string>();
        for (const tool of openaiBody.tools) {
          const name =
            tool.type === "function" && tool.function?.name
              ? tool.function.name
              : (tool as any).name;
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
    console.error("OpenAI request handling error:", error);
    const fullError = error instanceof Error ? error.message : String(error);
    logger.error(`OpenAI request handling error: ${fullError}`);
    return Response.json(
      { error: { message: "Request processing failed", type: "invalid_request_error" } },
      { status: 400 },
    );
  }
}
