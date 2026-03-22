/**
 * SSE streaming pipeline: converts Anthropic streaming events to OpenAI chat.completion.chunk format
 */

import {
  createOpenAIStreamChunk,
  createOpenAIStreamStart,
  createOpenAIStreamUsageChunk,
  createOpenAIToolCallChunk,
  computeOpenAIUsage,
} from "./openai-adapter";
import { formatInternalToolContent } from "./internal-tools";
import { logger } from "./logger";

/**
 * Creates a ReadableStream that converts Anthropic SSE events into OpenAI-compatible
 * chat.completion.chunk SSE format in real-time.
 */
export function createOpenAIStreamFromAnthropic(
  response: Response,
  streamId: string,
  model: string,
  streamOptions?: { include_usage?: boolean },
  userToolNames?: Set<string>
): ReadableStream {
  const reader = response.body!.getReader();
  const HEARTBEAT_INTERVAL = 5000;
  const includeUsageNull = !!streamOptions?.include_usage;

  let cancelled = false;

  return new ReadableStream({
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
      let inTextThinkingTag = false;   // true while inside <thinking>...</thinking> in text
      let textTagBuffer = "";          // buffers partial tag matches
      let usageInputTokens = 0;
      let usageOutputTokens = 0;
      let usageCacheReadTokens = 0;
      let usageCacheCreationTokens = 0;
      let messageStopped = false;

      // Helper to safely enqueue data, automatically injecting
      // "usage": null on SSE JSON chunks when include_usage is set
      const safeEnqueue = (data: Uint8Array) => {
        try {
          if (!cancelled) {
            if (includeUsageNull) {
              const str = new TextDecoder().decode(data);
              if (str.startsWith('data: {') && !str.includes('"usage"')) {
                const injected = str.replace(
                  /\}\s*\n\n$/,
                  ',"usage":null}\n\n'
                );
                controller.enqueue(new TextEncoder().encode(injected));
                return;
              }
            }
            controller.enqueue(data);
          }
        } catch {
          cancelled = true;
        }
      };

      // Global heartbeat timer
      const heartbeatTimer = setInterval(() => {
        if (cancelled || messageStopped) {
          clearInterval(heartbeatTimer);
          return;
        }
        const elapsed = Date.now() - lastChunkTime;
        if (elapsed >= HEARTBEAT_INTERVAL) {
          safeEnqueue(new TextEncoder().encode(`: heartbeat\n\n`));
          lastChunkTime = Date.now();
        }
      }, HEARTBEAT_INTERVAL);

      try {
        logger.verbose(`   [Debug] Starting to read stream...`);
        let chunkCount = 0;
        while (true) {
          if (cancelled) {
            logger.verbose(`   [Debug] Stream cancelled by client`);
            break;
          }

          const { done, value } = await reader.read();
          if (done) {
            console.log(
              `   [Debug] Stream ended after ${chunkCount} chunks`
            );
            if (!messageStopped) {
              console.log(
                `   [Debug] Stream ended without message_stop, sending fallback usage chunk`
              );
              safeEnqueue(
                new TextEncoder().encode(
                  createOpenAIStreamUsageChunk(
                    streamId,
                    model,
                    usageInputTokens,
                    usageOutputTokens,
                    usageCacheReadTokens,
                    usageCacheCreationTokens,
                  )
                )
              );
              safeEnqueue(
                new TextEncoder().encode("data: [DONE]\n\n")
              );
            }
            break;
          }

          if (cancelled) break;

          chunkCount++;
          if (chunkCount === 1) {
            console.log(
              `   [Debug] First chunk received, length: ${value.length}`
            );
          }

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
              if (chunkCount === 1) {
                console.log(
                  `   [Debug] First event type: ${event.type
                  }, full event: ${JSON.stringify(event).substring(0, 200)}`
                );
              }

              // Handle error events from the Anthropic API (e.g., overloaded, rate limit)
              // These arrive as SSE data with type "error" inside a 200 streaming response
              if (event.type === "error") {
                const errorMessage = event.error?.message || "Unknown API error";
                const errorType = event.error?.type || "api_error";
                console.log(`   [Error] Anthropic stream error: ${errorType} — ${errorMessage}`);

                if (!sentStart) {
                  safeEnqueue(
                    new TextEncoder().encode(
                      createOpenAIStreamStart(streamId, model)
                    )
                  );
                  sentStart = true;
                }

                // Emit the error as text content so the user sees it in Cursor
                safeEnqueue(
                  new TextEncoder().encode(
                    createOpenAIStreamChunk(streamId, model, `[Error: ${errorMessage}]`)
                  )
                );

                // Send stop + DONE
                safeEnqueue(
                  new TextEncoder().encode(
                    createOpenAIStreamChunk(streamId, model, undefined, "stop")
                  )
                );
                safeEnqueue(
                  new TextEncoder().encode("data: [DONE]\n\n")
                );
                messageStopped = true;
                lastChunkTime = Date.now();
                continue;
              }

              // Handle message_start
              if (event.type === "message_start") {
                if (!sentStart) {
                  safeEnqueue(
                    new TextEncoder().encode(
                      createOpenAIStreamStart(streamId, model)
                    )
                  );
                  sentStart = true;
                  console.log(`   [Debug] Sent OpenAI stream start chunk`);
                }
                if (event.message?.usage?.input_tokens !== undefined) {
                  usageCacheReadTokens = event.message.usage.cache_read_input_tokens || 0;
                  usageCacheCreationTokens = event.message.usage.cache_creation_input_tokens || 0;
                  // Total input tokens = uncached + cache_read + cache_creation
                  // Anthropic splits input_tokens into uncached only; we need the full total
                  // so Cursor displays the correct "context used" percentage
                  usageInputTokens = event.message.usage.input_tokens + usageCacheReadTokens + usageCacheCreationTokens;
                  console.log(
                    `   [Debug] Usage: input_tokens=${event.message.usage.input_tokens} + cache_read=${usageCacheReadTokens} + cache_creation=${usageCacheCreationTokens} = total prompt_tokens=${usageInputTokens}`
                  );
                }
              }

              // Handle content_block_start
              if (event.type === "content_block_start") {
                if (!sentStart) {
                  safeEnqueue(
                    new TextEncoder().encode(
                      createOpenAIStreamStart(streamId, model)
                    )
                  );
                  sentStart = true;
                }

                const block = event.content_block;
                logger.verbose(
                  `   [Debug] content_block_start: type=${block?.type}, block=${JSON.stringify(block)}`
                );

                currentBlockIndex = event.index ?? currentBlockIndex;
                blockTextSent = false;

                // Skip thinking blocks
                if (block?.type === "thinking") {
                  inThinkingBlock = true;
                  continue;
                }
                inThinkingBlock = false;

                if (block?.type === "text" && block.text) {
                  logger.verbose(
                    `   [Debug] content_block_start text block (${block.text.length} chars): ${block.text}`
                  );
                }

                // Handle tool_use blocks
                if (block?.type === "tool_use") {
                  const toolName = block.name?.startsWith("mcp_")
                    ? block.name.slice(4)
                    : block.name;

                  // Check if this is a user tool (sent by Cursor) or a Claude Code internal tool
                  // If userToolNames is undefined, no tools were sent → all tool calls are internal
                  const isUserTool = userToolNames !== undefined && userToolNames.has(toolName);

                  if (isUserTool) {
                    logger.verbose(
                      `   [Debug] tool_use block started (user tool): id=${block.id}, name=${toolName}`
                    );

                    currentToolCall = {
                      id: block.id,
                      name: toolName,
                      inputJson: "",
                    };

                    safeEnqueue(
                      new TextEncoder().encode(
                        createOpenAIToolCallChunk(
                          streamId,
                          model,
                          toolCallIndex,
                          block.id,
                          toolName,
                          undefined,
                          null
                        )
                      )
                    );
                  } else {
                    // Claude Code internal tool (CreatePlan, TodoWrite, etc.)
                    // Buffer JSON and extract content as text at block end
                    logger.verbose(
                      `   [Debug] tool_use block started (internal tool, will extract text): id=${block.id}, name=${toolName}`
                    );
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
                  logger.verbose(`   [Debug] Thinking block ended`);
                  continue;
                }

                if (inInternalToolCall) {
                  inInternalToolCall = false;
                  logger.verbose(`   [Debug] Internal tool call block ended: ${internalToolCallName}`);

                  // Parse buffered JSON and extract readable text
                  let extractedText: string | null = null;
                  try {
                    const parsed = internalToolCallJson ? JSON.parse(internalToolCallJson) : null;
                    extractedText = formatInternalToolContent(internalToolCallName, parsed);
                  } catch {
                    logger.verbose(`   [Debug] Failed to parse internal tool JSON for ${internalToolCallName}`);
                  }

                  if (extractedText) {
                    logger.info(`   Emitting extracted text from ${internalToolCallName} (${extractedText.length} chars)`);

                    if (!sentStart) {
                      safeEnqueue(
                        new TextEncoder().encode(
                          createOpenAIStreamStart(streamId, model)
                        )
                      );
                      sentStart = true;
                    }

                    safeEnqueue(
                      new TextEncoder().encode(
                        createOpenAIStreamChunk(streamId, model, extractedText)
                      )
                    );
                    lastChunkTime = Date.now();
                  }

                  internalToolCallJson = "";
                  internalToolCallName = "";
                  blockTextSent = false;
                  currentBlockIndex = -1;
                  continue;
                }

                logger.verbose(
                  `   [Debug] content_block_stop for index ${event.index}`
                );

                if (currentToolCall) {
                  console.log(
                    `   [Debug] Tool call done: ${currentToolCall.name} (${currentToolCall.inputJson.length} chars)`
                  );

                  if (!currentToolCall.inputJson) {
                    safeEnqueue(
                      new TextEncoder().encode(
                        createOpenAIToolCallChunk(
                          streamId,
                          model,
                          toolCallIndex,
                          undefined,
                          undefined,
                          "{}",
                          null
                        )
                      )
                    );
                  }

                  toolCallIndex++;
                  currentToolCall = null;
                }

                blockTextSent = false;
                currentBlockIndex = -1;
              }

              // Skip deltas for thinking blocks
              if (event.type === "content_block_delta" && inThinkingBlock) {
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
                    new TextEncoder().encode(
                      createOpenAIToolCallChunk(
                        streamId,
                        model,
                        toolCallIndex,
                        undefined,
                        undefined,
                        jsonChunk,
                        null
                      )
                    )
                  );
                  lastChunkTime = Date.now();
                }
                continue;
              }

              // Handle content_block_delta text events
              // Includes a state machine to filter <thinking>...</thinking> tags
              // that Claude may emit in plain text (not via the thinking API block).
              if (
                event.type === "content_block_delta" &&
                event.delta?.text
              ) {
                if (blockTextSent) {
                  logger.verbose(
                    `   [Debug] Skipping delta - already sent complete text from content_block_start`
                  );
                  continue;
                }

                if (!sentStart) {
                  safeEnqueue(
                    new TextEncoder().encode(
                      createOpenAIStreamStart(streamId, model)
                    )
                  );
                  sentStart = true;
                }

                let text = event.delta.text;

                // --- <thinking> tag filter state machine ---
                // Process character by character to handle tags split across chunks
                let output = "";
                for (let ci = 0; ci < text.length; ci++) {
                  const ch = text[ci]!;

                  if (inTextThinkingTag) {
                    // Inside <thinking> content — look for </thinking>
                    textTagBuffer += ch;
                    if (textTagBuffer.endsWith("</thinking>")) {
                      inTextThinkingTag = false;
                      textTagBuffer = "";
                      logger.verbose(`   [Debug] Filtered </thinking> closing tag from text delta`);
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
                        // Full match — enter thinking mode
                        inTextThinkingTag = true;
                        textTagBuffer = "";
                        logger.verbose(`   [Debug] Detected <thinking> tag in text delta, filtering`);
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
                  logger.verbose(
                    `   [Debug] content_block_delta chunk (${output.length} chars): ${JSON.stringify(output)}`
                  );

                  safeEnqueue(
                    new TextEncoder().encode(
                      createOpenAIStreamChunk(streamId, model, output)
                    )
                  );
                  lastChunkTime = Date.now();
                }
              }

              // Handle message_delta
              if (event.type === "message_delta") {
                if (event.usage?.output_tokens !== undefined) {
                  usageOutputTokens = event.usage.output_tokens;
                  console.log(
                    `   [Debug] Usage: output_tokens=${usageOutputTokens}`
                  );
                }
              }

              // Handle message_stop
              if (event.type === "message_stop") {
                messageStopped = true;

                const finishReason =
                  toolCallIndex > 0 ? "tool_calls" : "stop";

                safeEnqueue(
                  new TextEncoder().encode(
                    createOpenAIStreamChunk(
                      streamId,
                      model,
                      undefined,
                      finishReason as "stop" | "length",
                      computeOpenAIUsage(usageInputTokens, usageOutputTokens, usageCacheReadTokens)
                    )
                  )
                );
                safeEnqueue(
                  new TextEncoder().encode(
                    createOpenAIStreamUsageChunk(
                      streamId,
                      model,
                      usageInputTokens,
                      usageOutputTokens,
                      usageCacheReadTokens,
                      usageCacheCreationTokens,
                    )
                  )
                );
                console.log(
                  `   [Debug] Sent usage chunk: prompt=${usageInputTokens}, completion=${usageOutputTokens}, total=${usageInputTokens + usageOutputTokens}`
                );
                safeEnqueue(
                  new TextEncoder().encode("data: [DONE]\n\n")
                );
                logger.verbose(
                  `   [Debug] Sent [DONE] chunk with finish_reason: ${finishReason}`
                );
              }
            } catch (parseError) {
              if (!cancelled) {
                console.log(
                  `   [Debug] Failed to parse event: ${parseError}`
                );
              }
            }
          }
        }
      } catch (streamError) {
        if (!cancelled) {
          console.error(
            `   [Error] Stream processing failed: ${streamError}`
          );
          try {
            controller.error(streamError);
          } catch {
            // Controller already closed, ignore
          }
        }
      } finally {
        clearInterval(heartbeatTimer);

        try {
          if (!cancelled) {
            reader.cancel().catch(() => { });
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
      logger.verbose(
        `   [Debug] Stream cancelled by client: ${reason}`
      );
      cancelled = true;
      reader.cancel(reason).catch(() => { });
    },
  });
}
