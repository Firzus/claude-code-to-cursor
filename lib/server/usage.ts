import type { AnthropicResponse } from "./types";

export interface AnthropicUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  thinkingTokens: number;
}

/**
 * Coerce an Anthropic `usage` object (snake_case, possibly partial) into the
 * camelCase numeric snapshot used by `recordRequest` and the streaming code
 * paths. All fields default to 0 so callers don't need optional-chain noise.
 */
export function extractAnthropicUsage(
  usage: AnthropicResponse["usage"] | null | undefined,
): AnthropicUsageSnapshot {
  return {
    inputTokens: usage?.input_tokens || 0,
    outputTokens: usage?.output_tokens || 0,
    cacheReadTokens: usage?.cache_read_input_tokens || 0,
    cacheCreationTokens: usage?.cache_creation_input_tokens || 0,
    thinkingTokens: usage?.thinking_tokens ?? 0,
  };
}
