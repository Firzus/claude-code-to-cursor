/**
 * OpenAI to Anthropic API adapter
 * Converts OpenAI chat completion format to/from Anthropic messages format
 */

import type { AnthropicRequest, AnthropicMessage, ContentBlock } from "./types";
import { logger } from "./logger";

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenAIContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAIToolCall {
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

export interface OpenAIChatResponse {
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

export interface OpenAIStreamChunkToolCall {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface OpenAIStreamChunk {
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
 * Normalize Cursor model names to Anthropic format
 * Examples:
 * - claude-4.6-opus-high → claude-opus-4-6 (no thinking, -high is ignored without reasoning_effort)
 * - claude-4.6-opus-high-thinking → claude-opus-4-6 (thinking via reasoning_effort in body, fallback: high)
 * - claude-4.6-sonnet-high → claude-sonnet-4-6 (no thinking)
 * - claude-4.6-sonnet-high-thinking → claude-sonnet-4-6 (thinking via reasoning_effort in body, fallback: high)
 *
 * Thinking is primarily controlled by the reasoning_effort field sent separately by Cursor.
 * The -thinking suffix in the model name acts as a fallback budget (high=16384, medium=8192, low=4096).
 */
export function normalizeModelName(model: string): { model: string; reasoningBudget?: string } {
  // Handle Cursor's format: claude-{version}-(opus|sonnet|haiku)[-budget][-thinking]
  // Supports any version like 4.5, 4.6, 5.0, etc.
  // Only enable thinking when "-thinking" suffix is explicitly present
  const match = model.match(/^claude-(\d+\.\d+)-(opus|sonnet|haiku)(?:-(high|medium|low))?(-thinking)?$/);
  if (match) {
    const version = match[1]!;
    const modelType = match[2]!;
    const budget = match[3];
    const hasThinking = !!match[4]; // "-thinking" suffix present
    // Convert version "4.5" → "4-5", "4.6" → "4-6"
    const normalizedVersion = version.replace(".", "-");
    return {
      model: `claude-${modelType}-${normalizedVersion}`,
      // Only set reasoningBudget if -thinking suffix is present
      reasoningBudget: hasThinking ? (budget || "medium") : undefined,
    };
  }

  // Handle Anthropic format directly (passthrough)
  if (model.startsWith("claude-")) {
    return { model };
  }

  // Unknown format, passthrough
  return { model };
}

function convertContent(
  content: string | OpenAIContentPart[] | ContentBlock[]
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
      logger.verbose(`    [convertContent] Passing through tool_use block: id=${toolUse.id}, name=${toolUse.name}`);
      blocks.push(toolUse);
      continue;
    }

    if ((part as ContentBlock).type === "tool_result") {
      const toolResult = part as ContentBlock;
      logger.verbose(`    [convertContent] Passing through tool_result block: tool_use_id=${toolResult.tool_use_id}`);
      blocks.push(toolResult);
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
              media_type: match[1] as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
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
 * Map non-Claude model names to Claude equivalents
 * Cursor may send OpenAI/other model names when using Override Base URL
 */
function mapModelToClaude(model: string): string {
  const lower = model.toLowerCase();

  // Already a Claude model
  if (lower.startsWith("claude")) return model;

  // Map known non-Claude models to Claude equivalents
  // GPT-5.x / GPT-4.x -> claude-sonnet-4-6
  if (lower.startsWith("gpt-5") || lower.startsWith("gpt-4")) return "claude-sonnet-4-6";
  // o1/o3/o4 reasoning models -> claude-sonnet-4-6
  if (/^o[134]/.test(lower)) return "claude-sonnet-4-6";
  // Gemini -> claude-sonnet-4-6
  if (lower.startsWith("gemini")) return "claude-sonnet-4-6";

  // Default fallback
  console.log(`   [Warning] Unknown model "${model}", mapping to claude-sonnet-4-6`);
  return "claude-sonnet-4-6";
}

export function openaiToAnthropic(request: OpenAIChatRequest): AnthropicRequest {
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

  // Map non-Claude models to Claude equivalents
  const originalModel = request.model;
  request.model = mapModelToClaude(request.model);
  if (originalModel !== request.model) {
    console.log(`   [Debug] Model mapping: "${originalModel}" → "${request.model}"`);
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
    const contentPreview = typeof msg.content === "string"
      ? msg.content.slice(0, 100)
      : Array.isArray(msg.content)
        ? `[${msg.content.length} parts]`
        : String(msg.content).slice(0, 100);
    logger.verbose(`  [${i}] role=${msg.role}, tool_calls=${hasToolCalls}, tool_call_id=${hasToolCallId}, content=${contentPreview}...`);
  }

  for (const msg of request.messages) {
    if (msg.role === "system") {
      // Collect system messages
      const content =
        typeof msg.content === "string" ? msg.content : (msg.content || []).map((p) => p.text || "").join("\n");
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
          logger.verbose(`    -> tool_use: id=${toolCall.id}, name=${toolCall.function.name}, input=${JSON.stringify(input).slice(0, 200)}`);
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
      const resultContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      logger.verbose(`    -> tool_result content (first 500 chars): ${resultContent.slice(0, 500)}`);

      const toolResultContent: ContentBlock[] = [{
        type: "tool_result",
        tool_use_id: msg.tool_call_id || "",
        content: resultContent,
      }];

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
  if (messages.length > 0 && messages[0]!.role !== "user") {
    messages.unshift({ role: "user", content: "Continue." });
  }

  // Normalize model name from Cursor format
  const normalized = normalizeModelName(request.model);

  // Determine max_tokens: use Cursor's value or default to 4096
  const maxTokens = request.max_tokens || request.max_completion_tokens || 4096;
  const maxTokensSource = request.max_tokens
    ? "Cursor (max_tokens)"
    : request.max_completion_tokens
      ? "Cursor (max_completion_tokens)"
      : "Default (4096)";

  console.log(`   [Debug] Normalized model: "${request.model}" → "${normalized.model}"${normalized.reasoningBudget ? ` (reasoning_budget: ${normalized.reasoningBudget})` : ""}`);
  console.log(`   [Debug] Max tokens: ${maxTokens} (${maxTokensSource})`);

  const result: AnthropicRequest = {
    model: normalized.model,
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
        const t = tool as { type: string; function: { name: string; description?: string; parameters?: Record<string, unknown> } };
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

  // Determine thinking budget: prefer reasoning_effort from request body (Cursor's toggle),
  // fall back to model name suffix (-thinking)
  const thinkingBudget = request.reasoning_effort || normalized.reasoningBudget;

  if (thinkingBudget) {
    const budgetMap: Record<string, number> = {
      high: 16384,
      medium: 8192,
      low: 4096,
    };
    const budgetTokens = typeof thinkingBudget === "string"
      ? budgetMap[thinkingBudget] || 8192
      : Number(thinkingBudget) || 8192;

    result.thinking = {
      type: "enabled",
      budget_tokens: budgetTokens,
    };
    // Anthropic requires temperature=1 when thinking is enabled
    result.temperature = 1;
    // Ensure max_tokens is large enough (budget_tokens + output space)
    // Use 16384 tokens for output to support long responses (documentation, etc.)
    if (result.max_tokens < budgetTokens + 4096) {
      result.max_tokens = budgetTokens + 16384;
    }
    const source = request.reasoning_effort ? "reasoning_effort" : "model name";
    console.log(`   [Debug] Thinking enabled (${source}): budget_tokens=${budgetTokens}, max_tokens=${result.max_tokens}`);
  }

  return result;
}

export function anthropicToOpenai(
  anthropicResponse: any,
  model: string
): OpenAIChatResponse {
  let content = anthropicResponse.content
    ?.map((block: any) => {
      if (block.type === "text") return block.text;
      if (block.type === "tool_use") {
        const name = block.name?.startsWith("mcp_") ? block.name.slice(4) : block.name;
        return `[Tool: ${name}]`;
      }
      return "";
    })
    .join("") || "";

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
    usage: {
      prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
      completion_tokens: anthropicResponse.usage?.output_tokens || 0,
      total_tokens:
        (anthropicResponse.usage?.input_tokens || 0) +
        (anthropicResponse.usage?.output_tokens || 0),
      prompt_tokens_details: {
        cached_tokens: anthropicResponse.usage?.cache_read_input_tokens || 0,
      },
      completion_tokens_details: {
        reasoning_tokens: 0,
      },
    },
  };
}

export function createOpenAIStreamChunk(
  id: string,
  model: string,
  content?: string,
  finishReason?: "stop" | "length" | null,
  usage?: OpenAIStreamChunk["usage"]
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
  finishReason?: "tool_calls" | null
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
  logger.verbose(`   [EMIT TOOL CALL CHUNK] index=${toolCallIndex}, id=${toolCallId || '-'}, name=${functionName || '-'}, args=${functionArgs ? functionArgs.slice(0, 200) : '-'}, finish=${finishReason || '-'}`);
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
  cacheCreationTokens: number = 0,
): string {
  const chunk: OpenAIStreamChunk = {
    id: `chatcmpl-${id}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      prompt_tokens_details: {
        cached_tokens: cacheReadTokens,
      },
      completion_tokens_details: {
        reasoning_tokens: 0,
      },
    },
  };

  return `data: ${JSON.stringify(chunk)}\n\n`;
}


