import { proxyRequest } from "../anthropic-client";
import { logRequestDetails, extractHeaders } from "../middleware";
import {
  openaiToAnthropic,
  anthropicToOpenai,
  type OpenAIChatRequest,
} from "../openai-adapter";
import { createOpenAIStreamFromAnthropic } from "../stream-handler";
import { logger } from "../logger";

export async function handleOpenAIChatCompletions(req: Request): Promise<Response> {
  try {
    logRequestDetails(req, "OpenAI /v1/chat/completions");
    const openaiBody = (await req.json()) as OpenAIChatRequest;

    // Log the request body from Cursor (truncated)
    const bodyStr = JSON.stringify(openaiBody, null, 2);
    const truncatedBody =
      bodyStr.length > 500
        ? bodyStr.substring(0, 500) + "... [truncated]"
        : bodyStr;

    console.log(`\n📋 [Cursor Request Body]:`);
    console.log(`   Model: "${openaiBody.model}"`);
    console.log(`   Stream: ${openaiBody.stream || false}`);
    console.log(
      `   Max Tokens: ${openaiBody.max_tokens ||
      openaiBody.max_completion_tokens ||
      "not set"
      }`
    );
    console.log(`   Temperature: ${openaiBody.temperature || "not set"}`);
    console.log(`   Stream Options: ${JSON.stringify(openaiBody.stream_options) || "not set"}`);
    console.log(`   Messages Count: ${openaiBody.messages?.length || 0}`);
    const allKeys = Object.keys(openaiBody);
    console.log(`   All Request Keys: ${allKeys.join(", ")}`);
    logger.info(`   All Request Keys: ${allKeys.join(", ")}`);
    if ((openaiBody as any).reasoning_effort) {
      console.log(`   Reasoning Effort: ${(openaiBody as any).reasoning_effort}`);
      logger.info(`   Reasoning Effort: ${(openaiBody as any).reasoning_effort}`);
    }

    // Log the FULL raw request body to file for debugging tool call format
    logger.verbose(`\n🔍 [FULL Cursor Request Body]:`);
    logger.verbose(JSON.stringify(openaiBody, null, 2));

    // Log all messages, especially system messages (verbose to file)
    if (openaiBody.messages && openaiBody.messages.length > 0) {
      logger.verbose(`\n📝 [Cursor Messages]:`);
      openaiBody.messages.forEach((msg, idx) => {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);

        if (msg.role === "system") {
          logger.verbose(
            `   [${idx}] System Message (${content.length} chars):`
          );
          logger.verbose(
            `   ${content
              .split("\n")
              .map((l: string) => `      ${l}`)
              .join("\n")}`
          );
        } else {
          logger.verbose(
            `   [${idx}] ${msg.role} (${content.length} chars):`
          );
          logger.verbose(
            `   ${content
              .split("\n")
              .map((l: string) => `      ${l}`)
              .join("\n")}`
          );
        }
      });
    }

    console.log(`\n   Body Preview: ${truncatedBody}`);

    // Convert to Anthropic format
    const anthropicBody = openaiToAnthropic(openaiBody);
    const headers = extractHeaders(req);

    console.log(
      `\n→ [OpenAI→Anthropic] Original: "${openaiBody.model}" → Normalized: "${anthropicBody.model}" | ${anthropicBody.stream ? "stream" : "sync"
      } | max_tokens=${anthropicBody.max_tokens}`
    );
    if (anthropicBody.reasoning_budget) {
      console.log(`   Reasoning Budget: ${anthropicBody.reasoning_budget}`);
    }

    // Log the system prompt that will be sent to Claude Code (verbose to file)
    if (anthropicBody.system) {
      const systemContent =
        typeof anthropicBody.system === "string"
          ? anthropicBody.system
          : Array.isArray(anthropicBody.system)
            ? anthropicBody.system
              .map((block) =>
                block &&
                  typeof block === "object" &&
                  "type" in block &&
                  block.type === "text"
                  ? block.text
                  : JSON.stringify(block)
              )
              .join("\n")
            : String(anthropicBody.system);
      logger.verbose(
        `\n📋 [Anthropic System Prompt] (${systemContent.length} chars):`
      );
      logger.verbose(
        systemContent
          .split("\n")
          .map((l: string) => `   ${l}`)
          .join("\n")
      );
    }

    // Log Anthropic messages (verbose to file)
    if (anthropicBody.messages && anthropicBody.messages.length > 0) {
      logger.verbose(
        `\n📨 [Anthropic Messages] (${anthropicBody.messages.length}):`
      );
      anthropicBody.messages.forEach((msg, idx) => {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                .map((block) =>
                  block &&
                    typeof block === "object" &&
                    "type" in block &&
                    block.type === "text"
                    ? block.text
                    : JSON.stringify(block)
                )
                .join("\n")
              : JSON.stringify(msg.content);
        logger.verbose(
          `   [${idx}] ${msg.role} (${content.length} chars):`
        );
        logger.verbose(
          `   ${content
            .split("\n")
            .map((l: string) => `      ${l}`)
            .join("\n")}`
        );
      });
    }

    // Log what we're about to send
    console.log(`\n📤 [Prepared Request Summary]:`);
    console.log(`   System prompt present: ${!!anthropicBody.system}`);
    if (anthropicBody.system) {
      const sysStr =
        typeof anthropicBody.system === "string"
          ? anthropicBody.system
          : "array";
      console.log(
        `   System type: ${typeof anthropicBody.system}, preview: ${String(
          sysStr
        ).substring(0, 100)}...`
      );
    }

    const response = await proxyRequest(
      "/v1/messages",
      anthropicBody,
      headers
    );

    console.log(
      `   [Debug] Response status: ${response.status}, ok: ${response.ok}`
    );

    if (!response.ok) {
      const errorText = await response
        .clone()
        .text()
        .catch(() => "Unable to read error");
      console.log(
        `   [Debug] Error response: ${errorText.substring(0, 500)}`
      );
    }

    console.log(
      `   [Debug] Response headers: ${JSON.stringify(
        Object.fromEntries(response.headers)
      )}`
    );
    console.log(
      `   [Debug] Response body readable: ${response.body !== null}`
    );

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
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

      const stream = createOpenAIStreamFromAnthropic(
        response,
        streamId,
        openaiBody.model,
        openaiBody.stream_options
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

    const anthropicResponse = await response.json();
    const openaiResponse = anthropicToOpenai(
      anthropicResponse,
      openaiBody.model
    );

    return Response.json(openaiResponse, { headers: responseHeaders });
  } catch (error) {
    console.error("OpenAI request handling error:", error);
    return Response.json(
      { error: { message: String(error), type: "invalid_request_error" } },
      { status: 400 }
    );
  }
}
