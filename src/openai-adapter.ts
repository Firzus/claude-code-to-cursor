/**
 * OpenAI to Anthropic API adapter
 * Converts OpenAI chat completion format to/from Anthropic messages format
 */

import type { AnthropicRequest, AnthropicMessage, ContentBlock } from "./types";

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


function convertContent(
  content: string | OpenAIContentPart[]
): string | ContentBlock[] {
  if (typeof content === "string") {
    return content;
  }

  return content.map((part): ContentBlock => {
    if (part.type === "text") {
      return { type: "text", text: part.text || "" };
    }
    if (part.type === "image_url" && part.image_url) {
      // Handle base64 images
      const url = part.image_url.url;
      if (url.startsWith("data:")) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return {
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
          };
        }
      }
      // Handle URL images
      return {
        type: "image",
        source: {
          type: "url",
          url: url,
        },
      };
    }
    return { type: "text", text: "" };
  });
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
      messages.push({
        role: msg.role,
        content: convertContent(msg.content),
      });
    }
  }

  // Ensure messages alternate properly (Anthropic requirement)
  // If first message isn't user, prepend an empty user message
  if (messages.length > 0 && messages[0].role !== "user") {
    messages.unshift({ role: "user", content: "Continue." });
  }

  return {
    model: request.model,
    messages,
    system,
    max_tokens: request.max_tokens || request.max_completion_tokens || 4096,
    temperature: request.temperature,
    top_p: request.top_p,
    stream: request.stream,
    stop_sequences: request.stop
      ? Array.isArray(request.stop)
        ? request.stop
        : [request.stop]
      : undefined,
  };
}

export function anthropicToOpenai(
  anthropicResponse: any,
  model: string
): OpenAIChatResponse {
  const content = anthropicResponse.content
    ?.map((block: any) => {
      if (block.type === "text") return block.text;
      if (block.type === "tool_use")
        return `[Tool: ${block.name}]`;
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

