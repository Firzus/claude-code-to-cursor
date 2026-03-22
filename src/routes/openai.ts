import { proxyRequest } from "../anthropic-client";
import { MODEL } from "../config";
import { logRequestDetails, corsHeaders } from "../middleware";
import {
  openaiToAnthropic,
  anthropicToOpenai,
  type OpenAIChatRequest,
} from "../openai-adapter";
import { createOpenAIStreamFromAnthropic } from "../stream-handler";
import { logger } from "../logger";
import type { AnthropicRequest, AnthropicResponse, ContentBlock } from "../types";

function stringifyContent(
  content: string | ContentBlock[] | null | undefined
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content);
  return content
    .map((block) =>
      block && typeof block === "object" && "type" in block && block.type === "text"
        ? block.text
        : JSON.stringify(block)
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
  const bodyStr = JSON.stringify(openaiBody, null, 2);
  const truncatedBody =
    bodyStr.length > 500
      ? bodyStr.substring(0, 500) + "... [truncated]"
      : bodyStr;

  console.log(`\n📋 [Cursor Request Body]:`);
  console.log(`   Model: "${openaiBody.model}"`);
  console.log(`   Stream: ${openaiBody.stream || false}`);
  console.log(
    `   Max Tokens: ${openaiBody.max_tokens || openaiBody.max_completion_tokens || "not set"}`
  );
  console.log(`   Temperature: ${openaiBody.temperature || "not set"}`);
  console.log(`   Stream Options: ${JSON.stringify(openaiBody.stream_options) || "not set"}`);
  console.log(`   Messages Count: ${openaiBody.messages?.length || 0}`);

  const allKeys = Object.keys(openaiBody);
  console.log(`   All Request Keys: ${allKeys.join(", ")}`);
  logger.info(`   All Request Keys: ${allKeys.join(", ")}`);

  if (openaiBody.reasoning_effort) {
    console.log(`   Reasoning Effort: ${openaiBody.reasoning_effort}`);
    logger.info(`   Reasoning Effort: ${openaiBody.reasoning_effort}`);
  }

  logger.verbose(`\n🔍 [FULL Cursor Request Body]:`);
  logger.verbose(bodyStr);

  if (openaiBody.messages && openaiBody.messages.length > 0) {
    logger.verbose(`\n📝 [Cursor Messages]:`);
    openaiBody.messages.forEach((msg, idx) => {
      const content =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      logger.verbose(`   [${idx}] ${msg.role} (${content.length} chars):`);
      logger.verbose(`   ${indentBlock(content)}`);
    });
  }

  console.log(`\n   Body Preview: ${truncatedBody}`);
}

function logAnthropicConversion(
  openaiBody: OpenAIChatRequest,
  anthropicBody: AnthropicRequest
): void {
  const thinkingEnabled = !!anthropicBody.thinking;
  const thinkingBudget = thinkingEnabled ? anthropicBody.thinking!.budget_tokens : null;
  const routeSummary = `[OpenAI→Anthropic] Cursor model: "${openaiBody.model}" → API model: "${anthropicBody.model}" | thinking: ${thinkingEnabled ? `yes (${thinkingBudget} tokens)` : "no"} | ${anthropicBody.stream ? "stream" : "sync"} | max_tokens=${anthropicBody.max_tokens}`;
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

    logOpenAIRequest(openaiBody);

    const anthropicBody = openaiToAnthropic(openaiBody);

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
      `   [Debug] Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`
    );

    const responseHeaders = new Headers(corsHeaders());
    responseHeaders.set("Content-Type", "application/json");

    // Handle streaming
    if (anthropicBody.stream && response.ok) {
      responseHeaders.set("Content-Type", "text/event-stream");
      responseHeaders.set("Cache-Control", "no-cache");
      responseHeaders.set("Connection", "keep-alive");
      responseHeaders.set("X-Accel-Buffering", "no");

      const streamId = Date.now().toString();

      if (!response.body) {
        return Response.json(
          { error: { message: "No response body" } },
          { status: 500 }
        );
      }

      let userToolNames: Set<string> | undefined;
      if (openaiBody.tools && openaiBody.tools.length > 0) {
        userToolNames = new Set<string>();
        for (const tool of openaiBody.tools) {
          const name = tool.type === "function" && tool.function?.name
            ? tool.function.name
            : (tool as any).name;
          if (name) userToolNames.add(name);
        }
      }

      const stream = createOpenAIStreamFromAnthropic(
        response,
        streamId,
        MODEL,
        openaiBody.stream_options,
        userToolNames
      );

      return new Response(stream, { headers: responseHeaders });
    }

    // Non-streaming response
    if (!response.ok) {
      const error = (await response.json()) as {
        error?: { message?: string; type?: string };
      };
      let errorMessage = error?.error?.message || "Unknown error";
      if (errorMessage.includes("model:")) {
        errorMessage = errorMessage.replace(
          /model:\s*x-([^\s,]+)/g,
          (_match, modelName) => `model: ${modelName}`
        );
      }
      return Response.json(
        {
          error: {
            message: errorMessage,
            type: error?.error?.type,
          },
        },
        { status: response.status, headers: responseHeaders }
      );
    }

    const anthropicResponse = (await response.json()) as AnthropicResponse;
    const openaiResponse = anthropicToOpenai(anthropicResponse, MODEL);

    return Response.json(openaiResponse, { headers: responseHeaders });
  } catch (error) {
    console.error("OpenAI request handling error:", error);
    return Response.json(
      { error: { message: String(error), type: "invalid_request_error" } },
      { status: 400 }
    );
  }
}
