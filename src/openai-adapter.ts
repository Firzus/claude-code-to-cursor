/**
 * OpenAI to Anthropic API adapter
 * Converts OpenAI chat completion format to/from Anthropic messages format
 */

import { formatInternalToolContent } from "./internal-tools";
import { logger } from "./logger";
import {
  getInvalidPublicModelMessage,
  isAllowedPublicModel,
  type ThinkingEffort,
} from "./model-settings";
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

interface OpenAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/**
 * OpenAI Responses API tool shape — flat, no `function` wrapper. Cursor
 * sends tools in this format when using the Responses API path.
 */
interface OpenAIResponsesFunctionTool {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}

interface AnthropicToolDirect {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  cache_control?: { type: string };
}

type OpenAITool = OpenAIFunctionTool | OpenAIResponsesFunctionTool | AnthropicToolDirect;

const EMPTY_INPUT_SCHEMA = { type: "object", properties: {} } as const;

function isOpenAIChatTool(tool: unknown): tool is OpenAIFunctionTool {
  if (!tool || typeof tool !== "object") return false;
  const t = tool as { type?: unknown; function?: { name?: unknown } };
  return (
    t.type === "function" &&
    typeof t.function === "object" &&
    t.function !== null &&
    typeof t.function.name === "string"
  );
}

function isOpenAIResponsesTool(tool: unknown): tool is OpenAIResponsesFunctionTool {
  if (!tool || typeof tool !== "object") return false;
  const t = tool as { type?: unknown; name?: unknown };
  return t.type === "function" && typeof t.name === "string";
}

function isAnthropicTool(tool: unknown): tool is AnthropicToolDirect {
  if (!tool || typeof tool !== "object") return false;
  const t = tool as { name?: unknown };
  return typeof t.name === "string";
}

/**
 * Extract a tool's name across the three shapes Cursor / OpenAI / Anthropic
 * may send. Returns undefined for malformed entries.
 */
export function extractToolName(tool: unknown): string | undefined {
  if (isOpenAIChatTool(tool)) return tool.function.name;
  if (isOpenAIResponsesTool(tool)) return tool.name;
  if (isAnthropicTool(tool)) return tool.name;
  return undefined;
}

function isResponsesInputArray(input: unknown): input is ResponsesInputItem[] {
  if (!Array.isArray(input) || input.length === 0) return false;
  const first = input[0];
  return (
    !!first &&
    typeof first === "object" &&
    "type" in first &&
    typeof (first as { type?: unknown }).type === "string"
  );
}

function responsesContentToOpenAI(
  content: string | ResponsesContentPart[],
): string | OpenAIContentPart[] {
  if (typeof content === "string") return content;
  const parts: OpenAIContentPart[] = [];
  for (const part of content) {
    if (part.type === "input_text" || part.type === "output_text" || part.type === "text") {
      parts.push({ type: "text", text: part.text });
    } else if (part.type === "input_image") {
      parts.push({ type: "image_url", image_url: { url: part.image_url, detail: part.detail } });
    }
  }
  return parts;
}

/**
 * Translate OpenAI Responses API `input` items into Chat Completions messages
 * so the rest of the pipeline can consume them. Handles message envelopes,
 * function calls (assistant tool invocations), and function call outputs
 * (tool results). The `developer` role is mapped to `system`.
 *
 * Consecutive `function_call` items are batched into a single assistant
 * message with multiple `tool_calls`, matching Chat Completions semantics.
 */
export function responsesInputToChatMessages(items: ResponsesInputItem[]): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];
  let pendingToolCalls: OpenAIToolCall[] = [];

  const flushPendingToolCalls = () => {
    if (pendingToolCalls.length === 0) return;
    messages.push({ role: "assistant", content: null, tool_calls: pendingToolCalls });
    pendingToolCalls = [];
  };

  for (const item of items) {
    if (item.type === "message") {
      flushPendingToolCalls();
      const role = item.role === "developer" ? "system" : item.role;
      messages.push({ role, content: responsesContentToOpenAI(item.content) });
    } else if (item.type === "function_call") {
      pendingToolCalls.push({
        id: item.call_id,
        type: "function",
        function: { name: item.name, arguments: item.arguments },
      });
    } else if (item.type === "function_call_output") {
      flushPendingToolCalls();
      messages.push({ role: "tool", tool_call_id: item.call_id, content: item.output });
    }
    // `reasoning` items have no Chat Completions equivalent — drop silently.
  }

  flushPendingToolCalls();
  return messages;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI Responses API input item shapes. Items in `input` are typed
 * envelopes — they are NOT plain Chat Completions messages.
 */
type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "output_text"; text: string }
  | { type: "text"; text: string }
  | { type: "input_image"; image_url: string; detail?: "auto" | "low" | "high" };

type ResponsesInputItem =
  | {
      type: "message";
      role: "user" | "assistant" | "system" | "developer";
      content: string | ResponsesContentPart[];
    }
  | {
      type: "function_call";
      call_id: string;
      name: string;
      arguments: string;
      id?: string;
    }
  | {
      type: "function_call_output";
      call_id: string;
      output: string;
    }
  | {
      type: "reasoning";
      summary?: unknown;
      content?: unknown;
    };

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  /**
   * OpenAI Responses API field. Items here are Responses-API envelopes
   * ({type:"message"}, {type:"function_call"}, {type:"function_call_output"})
   * — NOT plain Chat Completions messages. Cursor sends this format.
   */
  input?: ResponsesInputItem[] | OpenAIMessage[] | string;
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
  reasoning_effort?: ThinkingEffort;
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: maps each OpenAI content part type to its Anthropic counterpart — one branch per type.
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
      blocks.push(part as ContentBlock);
      continue;
    }

    if ((part as ContentBlock).type === "tool_result") {
      const toolResult = part as ContentBlock;
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: full OpenAI→Anthropic conversion — branches cover message roles, tool calls, images; splitting would fragment a sequential pipeline.
export function openaiToAnthropicBase(
  originalRequest: OpenAIChatRequest,
  targetApiModel: string,
): AnthropicRequest {
  const request = { ...originalRequest };

  // Normalize: Responses API uses `input`. Items there are typed envelopes
  // ({type:"message"|"function_call"|"function_call_output"}), not plain
  // Chat Completions messages, so we translate them rather than aliasing.
  if (!request.messages && request.input !== undefined) {
    if (typeof request.input === "string") {
      request.messages = [{ role: "user", content: request.input }];
      logger.info(`[Conversion] input=string(${request.input.length}) → 1 message`);
    } else if (isResponsesInputArray(request.input)) {
      const before = request.input.length;
      request.messages = responsesInputToChatMessages(request.input);
      logger.info(
        `[Conversion] Responses API: ${before} items → ${request.messages.length} messages`,
      );
    } else {
      request.messages = request.input as OpenAIMessage[];
      logger.info(
        `[Conversion] input array (no type field) → ${request.messages.length} messages (legacy mode)`,
      );
    }
  }

  if (!request.messages) {
    logger.warn(`No 'messages' or 'input' found in request, using empty array`);
    request.messages = [];
  }

  if (!isAllowedPublicModel(request.model)) {
    throw new Error(getInvalidPublicModelMessage(request.model));
  }

  const messages: AnthropicMessage[] = [];
  let system: string | ContentBlock[] | undefined;

  logger.verbose(`[Conversion] ${request.messages.length} incoming messages`);

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
        for (const toolCall of msg.tool_calls) {
          let input = {};
          try {
            input = JSON.parse(toolCall.function.arguments);
          } catch {
            input = { raw: toolCall.function.arguments };
          }
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
      const rawResultContent =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const resultContent = trimToolResult(rawResultContent);

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
        lastMsg.content.push(...toolResultContent);
      } else {
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

  logger.verbose(`[Conversion] → ${messages.length} Anthropic messages`);

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

  logger.verbose(`Max tokens: ${maxTokens} (${maxTokensSource})`);

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

  if (request.tools && request.tools.length > 0) {
    // Three tool shapes can show up — Cursor uses the flat Responses API
    // form, hence the per-tool detection rather than branching on the first.
    const converted: AnthropicToolDirect[] = [];
    let skipped = 0;
    for (const tool of request.tools) {
      if (isOpenAIChatTool(tool)) {
        converted.push({
          name: tool.function.name,
          description: tool.function.description || "",
          input_schema: tool.function.parameters || { ...EMPTY_INPUT_SCHEMA },
        });
      } else if (isOpenAIResponsesTool(tool)) {
        converted.push({
          name: tool.name,
          description: tool.description || "",
          input_schema: tool.parameters || { ...EMPTY_INPUT_SCHEMA },
        });
      } else if (isAnthropicTool(tool)) {
        converted.push({
          name: tool.name,
          description: tool.description || "",
          input_schema: tool.input_schema || { ...EMPTY_INPUT_SCHEMA },
          ...(tool.cache_control ? { cache_control: tool.cache_control } : {}),
        });
      } else {
        skipped++;
      }
    }

    if (skipped > 0) {
      logger.warn(`[Conversion] dropped ${skipped}/${request.tools.length} malformed tool(s)`);
    }

    if (converted.length > 0) {
      result.tools = converted as typeof result.tools;
    }
    logger.verbose(`[Conversion] ${converted.length} tools (of ${request.tools.length})`);
  }

  if (request.tool_choice) {
    if (typeof request.tool_choice === "object" && "type" in request.tool_choice) {
      const tc = request.tool_choice;
      result.tool_choice = {
        type: tc.type === "function" ? ("tool" as const) : (tc.type as "auto" | "any" | "tool"),
        name: "function" in tc ? tc.function.name : undefined,
      };
    }
  }

  return result;
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

  return `data: ${JSON.stringify(chunk)}\n\n`;
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
