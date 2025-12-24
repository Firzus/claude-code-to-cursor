/**
 * OpenAI to Anthropic API adapter
 * Converts OpenAI chat completion format to/from Anthropic messages format
 */

import type { AnthropicRequest, AnthropicMessage, ContentBlock } from "./types";
import { translateToolCalls, needsTranslation } from "./tool-call-translator";

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string | OpenAIContentPart[];
}

export interface OpenAIContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
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
      content: string;
    };
    finish_reason: "stop" | "length" | "content_filter" | null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
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
      content?: string;
    };
    finish_reason: "stop" | "length" | "content_filter" | null;
  }[];
}

/**
 * Normalize Cursor model names to Anthropic format
 * Examples:
 * - claude-4.5-opus-high → claude-opus-4-5 (with reasoning_budget: high)
 * - claude-4.5-opus-high-thinking → claude-opus-4-5 (with reasoning_budget: high)
 * - claude-4.5-sonnet-high → claude-sonnet-4-5 (with reasoning_budget: high)
 * - claude-4.5-haiku → claude-haiku-4-5
 */
export function normalizeModelName(model: string): { model: string; reasoningBudget?: string } {
  // Handle Cursor's format: claude-4.5-{model}-{budget} or claude-4.5-{model}-{budget}-thinking
  const match = model.match(/^claude-4\.5-(opus|sonnet|haiku)(?:-(high|medium|low))?(?:-thinking)?$/);
  if (match) {
    const [, modelType, budget] = match;
    return {
      model: `claude-${modelType}-4-5`,
      reasoningBudget: budget || undefined,
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
  content: string | OpenAIContentPart[]
): string | ContentBlock[] {
  if (typeof content === "string") {
    return content;
  }

  const blocks: ContentBlock[] = [];
  
  for (const part of content) {
    if (part.type === "text") {
      // Only add text blocks if they have non-empty content
      if (part.text && part.text.trim().length > 0) {
        blocks.push({ type: "text", text: part.text });
      }
    } else if (part.type === "image_url" && part.image_url) {
      // Handle base64 images
      const url = part.image_url.url;
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

export function openaiToAnthropic(request: OpenAIChatRequest): AnthropicRequest {
  const messages: AnthropicMessage[] = [];
  let system: string | ContentBlock[] | undefined;

  for (const msg of request.messages) {
    if (msg.role === "system") {
      // Collect system messages
      const content =
        typeof msg.content === "string" ? msg.content : msg.content.map((p) => p.text || "").join("\n");
      if (system) {
        system = typeof system === "string" ? `${system}\n${content}` : system;
      } else {
        system = content;
      }
    } else if (msg.role === "user" || msg.role === "assistant") {
      const convertedContent = convertContent(msg.content);
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
        role: msg.role,
        content: convertedContent,
      });
    }
  }

  // Ensure messages alternate properly (Anthropic requirement)
  // If first message isn't user, prepend an empty user message
  if (messages.length > 0 && messages[0].role !== "user") {
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
  
  // Add reasoning_budget if present (Anthropic expects it as a number or specific string)
  if (normalized.reasoningBudget) {
    // Convert "high" to a number or keep as string depending on API requirements
    // For now, pass as string - may need to convert to number based on API docs
    result.reasoning_budget = normalized.reasoningBudget;
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
      if (block.type === "tool_use")
        return `[Tool: ${block.name}]`;
      return "";
    })
    .join("") || "";

  // Translate tool calls if present in non-streaming response
  if (needsTranslation(content)) {
    content = translateToolCalls(content);
  }

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
    },
  };
}

export function createOpenAIStreamChunk(
  id: string,
  model: string,
  content?: string,
  finishReason?: "stop" | "length" | null
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

