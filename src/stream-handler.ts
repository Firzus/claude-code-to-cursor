/**
 * SSE streaming pipeline: converts Anthropic streaming events to OpenAI chat.completion.chunk format
 */

import { createOpenAIErrorStream, createOpenAIErrorTail, toErrorMessage } from "./error-utils";
import { formatInternalToolContent } from "./internal-tools";
import { logger } from "./logger";
import {
  computeOpenAIUsage,
  createOpenAIStreamChunk,
  createOpenAIStreamStart,
  createOpenAIStreamUsageChunk,
  createOpenAIToolCallChunk,
} from "./openai-adapter";

const encoder = new TextEncoder();

/**
 * Creates a ReadableStream that converts Anthropic SSE events into OpenAI-compatible
 * chat.completion.chunk SSE format in real-time.
 */
export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Estimated from streamed thinking deltas when API does not split usage. */
  thinkingTokens: number;
}

export function createOpenAIStreamFromAnthropic(
  response: Response,
  streamId: string,
  model: string,
  streamOptions?: { include_usage?: boolean },
  userToolNames?: Set<string>,
  onComplete?: (usage: StreamUsage) => void,
): ReadableStream {
  const reader = response.body?.getReader();
  if (!reader) {
    return new ReadableStream({
      start(c) {
        c.close();
      },
    });
  }
  const HEARTBEAT_INTERVAL = 5000;
  const includeUsageNull = !!streamOptions?.include_usage;

  let cancelled = false;
  // Hoisted so the outer `cancel(reason)` handler can clear the timer
  // directly instead of waiting up to HEARTBEAT_INTERVAL for the timer
  // callback to observe `cancelled = true` on its next tick.
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  return new ReadableStream({
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: SSE Anthropic→OpenAI path shares one stateful parser; splitting would obscure stream semantics.
    async start(controller) {
      const decoder = new TextDecoder();
      let buffer = "";
      let sentStart = false;
      let lastChunkTime = Date.now();
      let currentBlockIndex = -1;
      let blockTextSent = false;
      let toolCallIndex = 0;
      let currentToolCall: {
        id: string;
        name: string;
        inputJson: string;
      } | null = null;
      let inInternalToolCall = false;
      let internalToolCallJson = "";
      let internalToolCallName = "";
      let inThinkingBlock = false;
      // State machine for filtering <thinking>...</thinking> tags in text deltas.
      // Claude can emit these in plain text even when thinking is not enabled via the API.
      let inTextThinkingTag = false; // true while inside <thinking>...</thinking> in text
      let textTagBuffer = ""; // buffers partial tag matches
      let usageInputTokens = 0;
      let usageOutputTokens = 0;
      let usageCacheReadTokens = 0;
      let usageCacheCreationTokens = 0;
      let freshInputTokens = 0;
      let messageStopped = false;
      /** Raw characters received in thinking_delta chunks (approximate token estimate). */
      let thinkingCharsAccum = 0;

      const safeEnqueue = (text: string) => {
        try {
          if (cancelled) return;
          let out = text;
          if (includeUsageNull && text.startsWith("data: {") && !text.includes('"usage"')) {
            out = text.replace(/\}\s*\n\n$/, ',"usage":null}\n\n');
          }
          controller.enqueue(encoder.encode(out));
        } catch {
          cancelled = true;
        }
      };

      // Global heartbeat timer — assigned to the outer `heartbeatTimer` ref
      // so the `cancel(reason)` handler can stop it immediately.
      heartbeatTimer = setInterval(() => {
        if (cancelled || messageStopped) {
          stopHeartbeat();
          return;
        }
        const elapsed = Date.now() - lastChunkTime;
        if (elapsed >= HEARTBEAT_INTERVAL) {
          safeEnqueue(`: heartbeat\n\n`);
          lastChunkTime = Date.now();
        }
      }, HEARTBEAT_INTERVAL);

      try {
        let chunkCount = 0;
        while (true) {
          if (cancelled) break;

          const { done, value } = await reader.read();
          if (done) {
            logger.verbose(`[Stream] Ended after ${chunkCount} chunks`);
            if (!messageStopped) {
              const reasoningFromStream = Math.ceil(thinkingCharsAccum / 4);
              safeEnqueue(
                createOpenAIStreamUsageChunk(
                  streamId,
                  model,
                  usageInputTokens,
                  usageOutputTokens,
                  usageCacheReadTokens,
                  usageCacheCreationTokens,
                  reasoningFromStream,
                ),
              );
              safeEnqueue("data: [DONE]\n\n");
              onComplete?.({
                inputTokens: freshInputTokens,
                outputTokens: usageOutputTokens,
                cacheReadTokens: usageCacheReadTokens,
                cacheCreationTokens: usageCacheCreationTokens,
                thinkingTokens: reasoningFromStream,
              });
            }
            break;
          }

          if (cancelled) break;

          chunkCount++;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (cancelled) break;
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") {
              continue;
            }

            try {
              const event = JSON.parse(data);

              // Handle error events from the Anthropic API (e.g., overloaded, rate limit)
              // These arrive as SSE data with type "error" inside a 200 streaming response
              if (event.type === "error") {
                const errorMessage = event.error?.message || "Unknown API error";
                const errorType = event.error?.type || "api_error";
                logger.error(`[Stream] Anthropic stream error: ${errorType} — ${errorMessage}`);

                const payload = sentStart
                  ? createOpenAIErrorTail(streamId, model, errorMessage)
                  : createOpenAIErrorStream(streamId, model, errorMessage);
                safeEnqueue(payload);
                sentStart = true;
                messageStopped = true;
                lastChunkTime = Date.now();
                continue;
              }

              // Handle message_start
              if (event.type === "message_start") {
                if (!sentStart) {
                  safeEnqueue(createOpenAIStreamStart(streamId, model));
                  sentStart = true;
                }
                if (event.message?.usage?.input_tokens !== undefined) {
                  usageCacheReadTokens = event.message.usage.cache_read_input_tokens || 0;
                  usageCacheCreationTokens = event.message.usage.cache_creation_input_tokens || 0;
                  freshInputTokens = event.message.usage.input_tokens;
                  usageInputTokens =
                    event.message.usage.input_tokens +
                    usageCacheReadTokens +
                    usageCacheCreationTokens;
                }
              }

              // Handle content_block_start
              if (event.type === "content_block_start") {
                if (!sentStart) {
                  safeEnqueue(createOpenAIStreamStart(streamId, model));
                  sentStart = true;
                }

                const block = event.content_block;

                currentBlockIndex = event.index ?? currentBlockIndex;
                blockTextSent = false;

                if (block?.type === "thinking") {
                  inThinkingBlock = true;
                  continue;
                }
                inThinkingBlock = false;

                if (block?.type === "tool_use") {
                  const toolName = block.name?.startsWith("mcp_")
                    ? block.name.slice(4)
                    : block.name;

                  // Check if this is a user tool (sent by Cursor) or a Claude Code internal tool
                  // If userToolNames is undefined, no tools were sent → all tool calls are internal
                  const isUserTool = userToolNames?.has(toolName);

                  if (isUserTool) {
                    currentToolCall = {
                      id: block.id,
                      name: toolName,
                      inputJson: "",
                    };

                    safeEnqueue(
                      createOpenAIToolCallChunk(
                        streamId,
                        model,
                        toolCallIndex,
                        block.id,
                        toolName,
                        undefined,
                        null,
                      ),
                    );
                  } else {
                    inInternalToolCall = true;
                    internalToolCallJson = "";
                    internalToolCallName = toolName;
                  }
                }
              }

              // Handle content_block_stop
              if (event.type === "content_block_stop") {
                if (inThinkingBlock) {
                  inThinkingBlock = false;
                  continue;
                }

                if (inInternalToolCall) {
                  inInternalToolCall = false;

                  // Parse buffered JSON and extract readable text
                  let extractedText: string | null = null;
                  try {
                    const parsed = internalToolCallJson ? JSON.parse(internalToolCallJson) : null;
                    extractedText = formatInternalToolContent(internalToolCallName, parsed);
                  } catch {}

                  if (extractedText) {
                    logger.info(
                      `   Emitting extracted text from ${internalToolCallName} (${extractedText.length} chars)`,
                    );

                    if (!sentStart) {
                      safeEnqueue(createOpenAIStreamStart(streamId, model));
                      sentStart = true;
                    }

                    safeEnqueue(createOpenAIStreamChunk(streamId, model, extractedText));
                    lastChunkTime = Date.now();
                  }

                  internalToolCallJson = "";
                  internalToolCallName = "";
                  blockTextSent = false;
                  currentBlockIndex = -1;
                  continue;
                }

                if (currentToolCall) {
                  if (!currentToolCall.inputJson) {
                    safeEnqueue(
                      createOpenAIToolCallChunk(
                        streamId,
                        model,
                        toolCallIndex,
                        undefined,
                        undefined,
                        "{}",
                        null,
                      ),
                    );
                  }

                  toolCallIndex++;
                  currentToolCall = null;
                }

                blockTextSent = false;
                currentBlockIndex = -1;
              }

              // Accumulate thinking deltas (not forwarded to OpenAI text stream)
              if (event.type === "content_block_delta" && inThinkingBlock) {
                const d = event.delta as { type?: string; thinking?: string } | undefined;
                if (d?.type === "thinking_delta" && typeof d.thinking === "string") {
                  thinkingCharsAccum += d.thinking.length;
                }
                continue;
              }

              // Buffer JSON deltas for internal tool calls (will be extracted as text at block end)
              if (event.type === "content_block_delta" && inInternalToolCall) {
                if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
                  internalToolCallJson += event.delta.partial_json;
                }
                continue;
              }

              // Handle input_json_delta for tool_use blocks
              if (
                event.type === "content_block_delta" &&
                event.delta?.type === "input_json_delta" &&
                currentToolCall
              ) {
                const jsonChunk = event.delta.partial_json || "";
                currentToolCall.inputJson += jsonChunk;
                if (jsonChunk) {
                  safeEnqueue(
                    createOpenAIToolCallChunk(
                      streamId,
                      model,
                      toolCallIndex,
                      undefined,
                      undefined,
                      jsonChunk,
                      null,
                    ),
                  );
                  lastChunkTime = Date.now();
                }
                continue;
              }

              // Handle content_block_delta text events
              // Includes a state machine to filter <thinking>...</thinking> tags
              // that Claude may emit in plain text (not via the thinking API block).
              if (event.type === "content_block_delta" && event.delta?.text) {
                if (blockTextSent) continue;

                if (!sentStart) {
                  safeEnqueue(createOpenAIStreamStart(streamId, model));
                  sentStart = true;
                }

                const text = event.delta.text;

                // --- <thinking> tag filter state machine ---
                // Process character by character to handle tags split across chunks
                let output = "";
                for (let ci = 0; ci < text.length; ci++) {
                  const ch = text.charAt(ci);

                  if (inTextThinkingTag) {
                    // Inside <thinking> content — look for </thinking>
                    textTagBuffer += ch;
                    if (textTagBuffer.endsWith("</thinking>")) {
                      inTextThinkingTag = false;
                      textTagBuffer = "";
                    }
                    continue;
                  }

                  if (textTagBuffer.length > 0) {
                    // We're buffering a potential <thinking> opening tag
                    textTagBuffer += ch;
                    const target = "<thinking>";
                    if (target.startsWith(textTagBuffer)) {
                      // Still a valid prefix
                      if (textTagBuffer === target) {
                        inTextThinkingTag = true;
                        textTagBuffer = "";
                      }
                    } else {
                      // Not a match — flush buffer as normal text
                      output += textTagBuffer;
                      textTagBuffer = "";
                    }
                    continue;
                  }

                  if (ch === "<") {
                    // Start buffering potential tag
                    textTagBuffer = "<";
                  } else {
                    output += ch;
                  }
                }

                if (output.length > 0) {
                  safeEnqueue(createOpenAIStreamChunk(streamId, model, output));
                  lastChunkTime = Date.now();
                }
              }

              // Handle message_delta
              if (event.type === "message_delta") {
                if (event.usage?.output_tokens !== undefined) {
                  usageOutputTokens = event.usage.output_tokens;
                }
              }

              // Handle message_stop
              if (event.type === "message_stop") {
                messageStopped = true;

                const finishReason = toolCallIndex > 0 ? "tool_calls" : "stop";
                const reasoningFromStream = Math.ceil(thinkingCharsAccum / 4);

                safeEnqueue(
                  createOpenAIStreamChunk(
                    streamId,
                    model,
                    undefined,
                    finishReason as "stop" | "length",
                    computeOpenAIUsage(
                      usageInputTokens,
                      usageOutputTokens,
                      usageCacheReadTokens,
                      reasoningFromStream,
                    ),
                  ),
                );
                safeEnqueue(
                  createOpenAIStreamUsageChunk(
                    streamId,
                    model,
                    usageInputTokens,
                    usageOutputTokens,
                    usageCacheReadTokens,
                    usageCacheCreationTokens,
                    reasoningFromStream,
                  ),
                );
                safeEnqueue("data: [DONE]\n\n");
                logger.verbose(
                  `[Stream] Done: prompt=${usageInputTokens} completion=${usageOutputTokens} reasoning≈${reasoningFromStream} finish=${finishReason} chunks=${chunkCount}`,
                );
                onComplete?.({
                  inputTokens: freshInputTokens,
                  outputTokens: usageOutputTokens,
                  cacheReadTokens: usageCacheReadTokens,
                  cacheCreationTokens: usageCacheCreationTokens,
                  thinkingTokens: reasoningFromStream,
                });
              }
            } catch {}
          }
        }
      } catch (streamError) {
        if (!cancelled) {
          const errMsg = toErrorMessage(streamError);
          logger.error(`[Stream] Processing failed: ${errMsg}`);
          try {
            const payload = sentStart
              ? createOpenAIErrorTail(streamId, model, errMsg)
              : createOpenAIErrorStream(streamId, model, errMsg);
            safeEnqueue(payload);
            controller.close();
          } catch {
            // Best effort — controller may already be closed
          }
        }
      } finally {
        stopHeartbeat();

        try {
          if (!cancelled) {
            reader.cancel().catch(() => {});
          }
        } catch {
          // Reader might already be released
        }

        try {
          if (!cancelled) {
            controller.close();
          }
        } catch {
          // Controller already closed
        }
      }
    },
    cancel(reason) {
      logger.verbose(`[Stream] Cancelled by client: ${reason}`);
      cancelled = true;
      // Stop the timer immediately so we don't keep firing heartbeats for
      // up to HEARTBEAT_INTERVAL ms after the client disconnects.
      stopHeartbeat();
      reader.cancel(reason).catch(() => {});
    },
  });
}
