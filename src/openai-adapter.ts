/**
 * OpenAI to Anthropic API adapter
 * Converts OpenAI chat completion format to/from Anthropic messages format
 */

import { formatInternalToolContent } from "./internal-tools";
import { logger } from "./logger";
import {
  getApiModelId,
  getInvalidPublicModelMessage,
  isAllowedPublicModel,
  type ModelSettings,
  type ThinkingEffort,
} from "./model-settings";
import { applyThinkingToBody, pickRoute } from "./routing-policy";
import { trimToolResult } from "./tool-result-trimmer";
import type { AnthropicMessage, AnthropicRequest, AnthropicResponse, ContentBlock } from "./types";

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  /** OpenAI Responses API format - alias for messages */
  input?: OpenAIMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
  tools?: OpenAITool[];
  tool_choice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
  stream_options?: { include_usage?: boolean };
  /** OpenAI reasoning_effort field — Cursor sends this when thinking is toggled */
  reasoning_effort?: "low" | "medium" | "high";
}

interface OpenAIChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      audio_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
      accepted_prediction_tokens?: number;
      rejected_prediction_tokens?: number;
      audio_tokens?: number;
    };
  };
}

interface OpenAIStreamChunkToolCall {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: "assistant";
      content?: string | null;
      tool_calls?: OpenAIStreamChunkToolCall[];
    };
    finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      audio_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
      accepted_prediction_tokens?: number;
      rejected_prediction_tokens?: number;
      audio_tokens?: number;
    };
  } | null;
}

/**
 * Build the OpenAI-compatible usage object from Anthropic token counts.
 * Anthropic's input_tokens only counts uncached tokens; we sum all sources
 * so Cursor displays the correct "context used" percentage.
 */
export function computeOpenAIUsage(
  promptTokens: number,
  completionTokens: number,
  cacheReadTokens: number = 0,
  reasoningTokens: number = 0,
) {
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_tokens_details: {
      cached_tokens: cacheReadTokens,
    },
    completion_tokens_details: {
      reasoning_tokens: reasoningTokens,
    },
  };
}

function convertContent(
  content: string | OpenAIContentPart[] | ContentBlock[],
): string | ContentBlock[] {
  if (typeof content === "string") {
    return content;
  }

  const blocks: ContentBlock[] = [];

  for (const part of content) {
    // Pass through Anthropic-format blocks (tool_use, tool_result) directly
    // Cursor sends these in Anthropic format, not OpenAI format
    if ((part as ContentBlock).type === "tool_use") {
      const toolUse = part as ContentBlock;
      logger.verbose(
        `    [convertContent] Passing through tool_use block: id=${toolUse.id}, name=${toolUse.name}`,
      );
      blocks.push(toolUse);
      continue;
    }

    if ((part as ContentBlock).type === "tool_result") {
      const toolResult = part as ContentBlock;
      logger.verbose(
        `    [convertContent] Passing through tool_result block: tool_use_id=${toolResult.tool_use_id}`,
      );
      if (typeof toolResult.content === "string") {
        blocks.push({ ...toolResult, content: trimToolResult(toolResult.content) });
      } else {
        blocks.push(toolResult);
      }
      continue;
    }

    // Handle OpenAI format parts
    const openaiPart = part as OpenAIContentPart;
    if (openaiPart.type === "text") {
      // Only add text blocks if they have non-empty content
      if (openaiPart.text && openaiPart.text.trim().length > 0) {
        blocks.push({ type: "text", text: openaiPart.text });
      }
    } else if (openaiPart.type === "image_url" && openaiPart.image_url) {
      // Handle base64 images
      const url = openaiPart.image_url.url;
      if (url.startsWith("data:")) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          blocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: match[2],
            },
          });
        }
      } else {
        // Handle URL images
        blocks.push({
          type: "image",
          source: {
            type: "url",
            url: url,
          },
        });
      }
    }
  }

  return blocks;
}

/**
 * Convert an OpenAI chat request to Anthropic format.
 * This base version does NOT apply thinking or model routing — those are
 * handled separately via applyThinkingToBody() from routing-policy.ts.
 *
 * @param originalRequest  The incoming OpenAI-format request
 * @param targetApiModel   The raw Anthropic model ID string to set on the body
 *                         (e.g. "claude-opus-4-7"). Use getApiModelId() from
 *                         the caller to resolve from ModelSettings.
 */
export function openaiToAnthropicBase(
  originalRequest: OpenAIChatRequest,
  targetApiModel: string,
): AnthropicRequest {
  const request = { ...originalRequest };

  // Normalize: Responses API uses `input` instead of `messages`
  if (!request.messages && request.input) {
    console.log(`   [Debug] Detected Responses API format: converting 'input' to 'messages'`);
    request.messages = request.input;
  }

  // Safety check: if still no messages, use empty array
  if (!request.messages) {
    console.log(`   [Warning] No 'messages' or 'input' found in request, using empty array`);
    request.messages = [];
  }

  if (!isAllowedPublicModel(request.model)) {
    throw new Error(getInvalidPublicModelMessage(request.model));
  }

  const messages: AnthropicMessage[] = [];
  let system: string | ContentBlock[] | undefined;

  // Log incoming message summary for debugging
  logger.verbose(`\n=== OPENAI TO ANTHROPIC CONVERSION ===`);
  logger.verbose(`Total incoming messages: ${request.messages.length}`);
  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i]!;
    const hasToolCalls = (msg as OpenAIMessage).tool_calls?.length || 0;
    const hasToolCallId = (msg as OpenAIMessage).tool_call_id || null;
    const contentPreview =
      typeof msg.content === "string"
        ? msg.content.slice(0, 100)
        : Array.isArray(msg.content)
          ? `[${msg.content.length} parts]`
          : String(msg.content).slice(0, 100);
    logger.verbose(
      `  [${i}] role=${msg.role}, tool_calls=${hasToolCalls}, tool_call_id=${hasToolCallId}, content=${contentPreview}...`,
    );
  }

  for (const msg of request.messages) {
    if (msg.role === "system") {
      // Collect system messages
      const content =
        typeof msg.content === "string"
          ? msg.content
          : (msg.content || []).map((p) => p.text || "").join("\n");
      if (system) {
        system = typeof system === "string" ? `${system}\n${content}` : system;
      } else {
        system = content;
      }
    } else if (msg.role === "assistant") {
      // Handle assistant messages - may have tool_calls
      const contentBlocks: ContentBlock[] = [];

      // Add text content if present
      if (msg.content) {
        const convertedContent = convertContent(msg.content);
        if (typeof convertedContent === "string" && convertedContent.trim().length > 0) {
          contentBlocks.push({ type: "text", text: convertedContent });
        } else if (Array.isArray(convertedContent)) {
          contentBlocks.push(...convertedContent);
        }
      }

      // Convert tool_calls to Anthropic tool_use blocks
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        logger.verbose(`  Converting ${msg.tool_calls.length} tool_calls to tool_use blocks`);
        for (const toolCall of msg.tool_calls) {
          let input = {};
          try {
            input = JSON.parse(toolCall.function.arguments);
          } catch {
            // If arguments aren't valid JSON, wrap in object
            input = { raw: toolCall.function.arguments };
          }
          logger.verbose(
            `    -> tool_use: id=${toolCall.id}, name=${toolCall.function.name}, input=${JSON.stringify(input).slice(0, 200)}`,
          );
          contentBlocks.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.function.name,
            input,
          });
        }
      }

      if (contentBlocks.length > 0) {
        messages.push({
          role: "assistant",
          content: contentBlocks,
        });
      }
    } else if (msg.role === "tool") {
      // Convert tool results to Anthropic tool_result blocks
      logger.verbose(`  Converting tool result: tool_call_id=${msg.tool_call_id}`);
      const rawResultContent =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const resultContent = trimToolResult(rawResultContent);
      logger.verbose(
        `    -> tool_result content (first 500 chars): ${resultContent.slice(0, 500)}`,
      );

      const toolResultContent: ContentBlock[] = [
        {
          type: "tool_result",
          tool_use_id: msg.tool_call_id || "",
          content: resultContent,
        },
      ];

      // Check if the last message is a user message - if so, append to it
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "user" && Array.isArray(lastMsg.content)) {
        logger.verbose(`    -> Appending to existing user message`);
        lastMsg.content.push(...toolResultContent);
      } else {
        logger.verbose(`    -> Creating new user message for tool_result`);
        messages.push({
          role: "user",
          content: toolResultContent,
        });
      }
    } else if (msg.role === "user") {
      const convertedContent = convertContent(msg.content || "");
      // Skip messages with no valid content blocks
      if (typeof convertedContent === "string") {
        // String content: skip if empty
        if (convertedContent.trim().length === 0) {
          continue;
        }
      } else {
        // Array content: skip if empty after filtering
        if (convertedContent.length === 0) {
          continue;
        }
      }
      messages.push({
        role: "user",
        content: convertedContent,
      });
    }
  }

  // Log converted messages summary
  logger.verbose(`\nConverted to ${messages.length} Anthropic messages:`);
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (Array.isArray(msg.content)) {
      const types = msg.content.map((b: ContentBlock) => b.type).join(", ");
      logger.verbose(`  [${i}] role=${msg.role}, content=[${types}]`);
    } else {
      logger.verbose(`  [${i}] role=${msg.role}, content=${String(msg.content).slice(0, 100)}...`);
    }
  }

  // Ensure messages alternate properly (Anthropic requirement)
  // If first message isn't user, prepend an empty user message
  if (messages.length > 0 && messages[0]?.role !== "user") {
    messages.unshift({ role: "user", content: "Continue." });
  }

  // Determine max_tokens: use Cursor's value or default to 4096
  const maxTokens = request.max_tokens || request.max_completion_tokens || 4096;
  const maxTokensSource = request.max_tokens
    ? "Cursor (max_tokens)"
    : request.max_completion_tokens
      ? "Cursor (max_completion_tokens)"
      : "Default (4096)";

  console.log(`   [Debug] Max tokens: ${maxTokens} (${maxTokensSource})`);

  // Note: thinking block and temperature are applied later via applyThinkingToBody()
  const result: AnthropicRequest = {
    model: targetApiModel,
    messages,
    system,
    max_tokens: maxTokens,
    temperature: request.temperature,
    top_p: request.top_p,
    stream: request.stream,
    stop_sequences: request.stop
      ? Array.isArray(request.stop)
        ? request.stop
        : [request.stop]
      : undefined,
  };

  // Pass through tools - Cursor already sends them in Anthropic format
  // (name, description, input_schema) not OpenAI format (type: "function", function: {...})
  if (request.tools && request.tools.length > 0) {
    // Check if it's OpenAI format (has type: "function") or Anthropic format (has name directly)
    const firstTool = request.tools[0] as unknown as Record<string, unknown>;
    if (firstTool.type === "function" && firstTool.function) {
      // OpenAI format - convert to Anthropic
      result.tools = request.tools.map((tool) => {
        const t = tool as {
          type: string;
          function: { name: string; description?: string; parameters?: Record<string, unknown> };
        };
        return {
          name: t.function.name,
          description: t.function.description || "",
          input_schema: t.function.parameters || { type: "object", properties: {} },
        };
      });
    } else {
      // Already Anthropic format - pass through directly
      result.tools = request.tools as unknown as typeof result.tools;
    }
    console.log(`   [Debug] Passing ${request.tools.length} tools to Anthropic`);
  }

  // Pass through tool_choice - Cursor sends it in Anthropic format
  if (request.tool_choice) {
    result.tool_choice = request.tool_choice as unknown as typeof result.tool_choice;
  }

  return result;
}

/**
 * @deprecated Use openaiToAnthropicBase + pickRoute + applyThinkingToBody instead.
 * Kept for backward-compatibility; internally applies the routing policy.
 */
export function openaiToAnthropic(
  originalRequest: OpenAIChatRequest,
  modelSettings: ModelSettings,
): AnthropicRequest {
  const apiModelId = getApiModelId(modelSettings.selectedModel);
  const base = openaiToAnthropicBase(originalRequest, apiModelId);
  const clientEffort =
    typeof originalRequest.reasoning_effort === "string" &&
    ["low", "medium", "high"].includes(originalRequest.reasoning_effort)
      ? (originalRequest.reasoning_effort as ThinkingEffort)
      : null;
  const decision = pickRoute({ settings: modelSettings, clientEffort });
  return applyThinkingToBody(
    base,
    decision,
    originalRequest.max_tokens ?? originalRequest.max_completion_tokens,
    originalRequest.temperature,
    apiModelId,
  );
}

export function anthropicToOpenai(
  anthropicResponse: AnthropicResponse,
  model: string,
): OpenAIChatResponse {
  let content =
    anthropicResponse.content
      ?.map((block: ContentBlock) => {
        if (block.type === "text") return block.text;
        if (block.type === "tool_use") {
          const rawName = block.name || "";
          const name = rawName.startsWith("mcp_") ? rawName.slice(4) : rawName;
          const extracted = formatInternalToolContent(name, block.input);
          if (extracted) return extracted;
          return `[Tool: ${name}]`;
        }
        return "";
      })
      .join("") || "";

  // Strip <thinking>...</thinking> tags that Claude may emit in plain text
  // (separate from the API thinking blocks which are already filtered by type)
  content = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();

  return {
    id: `chatcmpl-${anthropicResponse.id || Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason:
          anthropicResponse.stop_reason === "end_turn"
            ? "stop"
            : anthropicResponse.stop_reason === "max_tokens"
              ? "length"
              : "stop",
      },
    ],
    usage: computeOpenAIUsage(
      (anthropicResponse.usage?.input_tokens || 0) +
        (anthropicResponse.usage?.cache_read_input_tokens || 0) +
        (anthropicResponse.usage?.cache_creation_input_tokens || 0),
      anthropicResponse.usage?.output_tokens || 0,
      anthropicResponse.usage?.cache_read_input_tokens || 0,
      anthropicResponse.usage?.thinking_tokens ?? 0,
    ),
  };
}

export function createOpenAIStreamChunk(
  id: string,
  model: string,
  content?: string,
  finishReason?: "stop" | "length" | null,
  usage?: OpenAIStreamChunk["usage"],
): string {
  const chunk: OpenAIStreamChunk = {
    id: `chatcmpl-${id}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: content !== undefined ? { content } : {},
        finish_reason: finishReason || null,
      },
    ],
  };

  if (usage !== undefined) {
    chunk.usage = usage;
  }

  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export function createOpenAIStreamStart(id: string, model: string): string {
  const chunk: OpenAIStreamChunk = {
    id: `chatcmpl-${id}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: { role: "assistant" },
        finish_reason: null,
      },
    ],
  };

  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * Create an OpenAI tool call stream chunk
 * OpenAI streams tool calls in multiple chunks:
 * 1. First chunk has id, type, and function.name
 * 2. Subsequent chunks have function.arguments (can be streamed in parts)
 */
export function createOpenAIToolCallChunk(
  id: string,
  model: string,
  toolCallIndex: number,
  toolCallId?: string,
  functionName?: string,
  functionArgs?: string,
  finishReason?: "tool_calls" | null,
): string {
  const toolCall: OpenAIStreamChunkToolCall = {
    index: toolCallIndex,
  };

  if (toolCallId) {
    toolCall.id = toolCallId;
    toolCall.type = "function";
  }

  if (functionName || functionArgs) {
    toolCall.function = {};
    if (functionName) toolCall.function.name = functionName;
    if (functionArgs) toolCall.function.arguments = functionArgs;
  }

  const chunk: OpenAIStreamChunk = {
    id: `chatcmpl-${id}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [toolCall],
        },
        finish_reason: finishReason || null,
      },
    ],
  };

  const result = `data: ${JSON.stringify(chunk)}\n\n`;
  logger.verbose(
    `   [EMIT TOOL CALL CHUNK] index=${toolCallIndex}, id=${toolCallId || "-"}, name=${functionName || "-"}, args=${functionArgs ? functionArgs.slice(0, 200) : "-"}, finish=${finishReason || "-"}`,
  );
  return result;
}

/**
 * Create a final OpenAI stream chunk with usage information.
 * OpenAI sends this as the last chunk before [DONE] with an empty choices array.
 * Includes prompt_tokens_details and completion_tokens_details for Cursor context display.
 */
export function createOpenAIStreamUsageChunk(
  id: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  cacheReadTokens: number = 0,
  _cacheCreationTokens: number = 0,
  reasoningTokens: number = 0,
): string {
  const chunk: OpenAIStreamChunk = {
    id: `chatcmpl-${id}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [],
    usage: computeOpenAIUsage(promptTokens, completionTokens, cacheReadTokens, reasoningTokens),
  };

  return `data: ${JSON.stringify(chunk)}\n\n`;
}
