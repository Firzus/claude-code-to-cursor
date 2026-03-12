/**
 * SSE streaming pipeline: converts Anthropic streaming events to OpenAI chat.completion.chunk format
 */

import {
  createOpenAIStreamChunk,
  createOpenAIStreamStart,
  createOpenAIStreamUsageChunk,
  createOpenAIToolCallChunk,
  parseXMLToolCalls,
} from "./openai-adapter";
import {
  translateToolCalls,
  needsTranslation,
} from "./tool-call-translator";
import { logger } from "./logger";

/**
 * Creates a ReadableStream that converts Anthropic SSE events into OpenAI-compatible
 * chat.completion.chunk SSE format in real-time.
 */
export function createOpenAIStreamFromAnthropic(
  response: Response,
  streamId: string,
  model: string,
  streamOptions?: { include_usage?: boolean }
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
      let toolCallBuffer = "";
      let inToolCall = false;
      let lastChunkTime = Date.now();
      let currentBlockIndex = -1;
      let blockTextSent = false;
      let toolCallIndex = 0;
      let currentToolCall: {
        id: string;
        name: string;
        inputJson: string;
      } | null = null;
      let inThinkingBlock = false;
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
                  usageInputTokens = event.message.usage.input_tokens;
                  usageCacheReadTokens = event.message.usage.cache_read_input_tokens || 0;
                  usageCacheCreationTokens = event.message.usage.cache_creation_input_tokens || 0;
                  console.log(
                    `   [Debug] Usage: input_tokens=${usageInputTokens} (cache_read=${usageCacheReadTokens}, cache_creation=${usageCacheCreationTokens})`
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
                  logger.verbose(
                    `   [Debug] tool_use block started: id=${block.id}, name=${block.name}`
                  );

                  const toolName = block.name?.startsWith("mcp_")
                    ? block.name.slice(4)
                    : block.name;

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
                }
              }

              // Handle content_block_stop
              if (event.type === "content_block_stop") {
                if (inThinkingBlock) {
                  inThinkingBlock = false;
                  logger.verbose(`   [Debug] Thinking block ended`);
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

                logger.verbose(
                  `   [Debug] content_block_delta chunk (${text.length} chars): ${JSON.stringify(text)}`
                );

                // Check for tool call markers
                const hasToolCallMarkers =
                  /<function_calls/i.test(text) ||
                  /<invoke/i.test(text) ||
                  /<\/invoke>/i.test(text) ||
                  /<\/function_calls>/i.test(text) ||
                  /<search_files/i.test(text) ||
                  /<read_file/i.test(text) ||
                  /<\/search_files>/i.test(text) ||
                  /<\/read_file>/i.test(text) ||
                  /<grep>/i.test(text) ||
                  /<\/grep>/i.test(text);

                const mightStartToolCall =
                  !inToolCall &&
                  (/<sea/i.test(text) ||
                    /<rea/i.test(text) ||
                    /<gre/i.test(text) ||
                    /<inv/i.test(text) ||
                    /<fun/i.test(text));

                if (hasToolCallMarkers) {
                  logger.verbose(
                    `   [Debug] Detected tool call markers in chunk!`
                  );
                }

                if (mightStartToolCall) {
                  logger.verbose(
                    `   [Debug] Detected potential tool call start in chunk!`
                  );
                }

                if (
                  hasToolCallMarkers ||
                  inToolCall ||
                  mightStartToolCall
                ) {
                  if (
                    !inToolCall &&
                    (mightStartToolCall || hasToolCallMarkers)
                  ) {
                    const toolCallStartMatch = text.match(/<[a-z]/i);
                    if (
                      toolCallStartMatch &&
                      toolCallStartMatch.index !== undefined
                    ) {
                      const beforeToolCall = text.substring(
                        0,
                        toolCallStartMatch.index
                      );
                      const toolCallPart = text.substring(
                        toolCallStartMatch.index
                      );

                      if (beforeToolCall) {
                        safeEnqueue(
                          new TextEncoder().encode(
                            createOpenAIStreamChunk(
                              streamId,
                              model,
                              beforeToolCall
                            )
                          )
                        );
                        logger.verbose(
                          `   [Debug] Sent text before tool call: "${beforeToolCall}"`
                        );
                      }

                      inToolCall = true;
                      toolCallBuffer = toolCallPart;
                      logger.verbose(
                        `   [Debug] Started buffering tool call: "${toolCallPart.substring(0, 50)}..."`
                      );
                    } else {
                      inToolCall = true;
                      toolCallBuffer += text;
                      logger.verbose(
                        `   [Debug] Buffering entire chunk (no split point found)`
                      );
                    }
                  } else if (inToolCall) {
                    toolCallBuffer += text;
                    logger.verbose(
                      `   [Debug] Continuing to buffer tool call, total: ${toolCallBuffer.length} chars`
                    );
                  } else {
                    inToolCall = true;
                    toolCallBuffer += text;
                  }

                  // Check if we now have a complete tool call
                  let completeToolCall = "";
                  let remainingBuffer = "";

                  const openMatch = toolCallBuffer.match(
                    /<(search_files|read_file|grep|invoke|function_calls)/i
                  );
                  if (
                    openMatch &&
                    openMatch.index !== undefined &&
                    openMatch[1]
                  ) {
                    const tagName = openMatch[1];
                    const closeTag = `</${tagName}>`;

                    const closeIndex = toolCallBuffer.indexOf(
                      closeTag,
                      openMatch.index
                    );
                    if (closeIndex !== -1) {
                      completeToolCall = toolCallBuffer.substring(
                        openMatch.index,
                        closeIndex + closeTag.length
                      );
                      remainingBuffer = toolCallBuffer.substring(
                        closeIndex + closeTag.length
                      );
                    }
                  }

                  if (completeToolCall) {
                    const parsedToolCalls =
                      parseXMLToolCalls(completeToolCall);

                    toolCallBuffer = remainingBuffer;
                    if (!toolCallBuffer) {
                      inToolCall = false;
                    }

                    if (parsedToolCalls.length > 0) {
                      logger.verbose(
                        `   [Debug] Parsed ${parsedToolCalls.length} tool call(s) from XML:\n${JSON.stringify(parsedToolCalls, null, 2)}`
                      );

                      for (const [i, tc] of parsedToolCalls.entries()) {
                        const toolCallId = `call_${Date.now()}_${i}`;

                        safeEnqueue(
                          new TextEncoder().encode(
                            createOpenAIToolCallChunk(
                              streamId,
                              model,
                              toolCallIndex,
                              toolCallId,
                              tc.name,
                              undefined,
                              null
                            )
                          )
                        );

                        safeEnqueue(
                          new TextEncoder().encode(
                            createOpenAIToolCallChunk(
                              streamId,
                              model,
                              toolCallIndex,
                              undefined,
                              undefined,
                              JSON.stringify(tc.arguments),
                              null
                            )
                          )
                        );

                        toolCallIndex++;
                      }
                    } else {
                      logger.verbose(
                        `   [Debug] Could not parse tool call, sending as text: ${completeToolCall.substring(0, 100)}...`
                      );
                      safeEnqueue(
                        new TextEncoder().encode(
                          createOpenAIStreamChunk(
                            streamId,
                            model,
                            completeToolCall
                          )
                        )
                      );
                    }
                    continue;
                  } else {
                    const timeSinceLastChunk = Date.now() - lastChunkTime;
                    if (timeSinceLastChunk > HEARTBEAT_INTERVAL) {
                      safeEnqueue(
                        new TextEncoder().encode(
                          createOpenAIStreamChunk(
                            streamId,
                            model,
                            ""
                          )
                        )
                      );
                      lastChunkTime = Date.now();
                    }
                    continue;
                  }
                }

                // Translate any remaining tool calls in the text
                if (needsTranslation(text)) {
                  const originalText = text;
                  text = translateToolCalls(text);
                  if (text !== originalText) {
                    logger.verbose(
                      `   [Debug] Translated tool call format in chunk:\n     Original (${originalText.length} chars):\n${originalText
                        .split("\n")
                        .map((l: string) => `       ${l}`)
                        .join("\n")}\n     Translated (${text.length} chars):\n${text
                          .split("\n")
                          .map((l: string) => `       ${l}`)
                          .join("\n")}`
                    );
                  }
                }

                safeEnqueue(
                  new TextEncoder().encode(
                    createOpenAIStreamChunk(streamId, model, text)
                  )
                );
                lastChunkTime = Date.now();
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
                // Flush any remaining tool call buffer
                if (toolCallBuffer) {
                  const parsedToolCalls =
                    parseXMLToolCalls(toolCallBuffer);
                  if (parsedToolCalls.length > 0) {
                    for (const [i, tc] of parsedToolCalls.entries()) {
                      const toolCallId = `call_${Date.now()}_${i}`;

                      safeEnqueue(
                        new TextEncoder().encode(
                          createOpenAIToolCallChunk(
                            streamId,
                            model,
                            toolCallIndex,
                            toolCallId,
                            tc.name,
                            undefined,
                            null
                          )
                        )
                      );

                      safeEnqueue(
                        new TextEncoder().encode(
                          createOpenAIToolCallChunk(
                            streamId,
                            model,
                            toolCallIndex,
                            undefined,
                            undefined,
                            JSON.stringify(tc.arguments),
                            null
                          )
                        )
                      );

                      toolCallIndex++;
                    }
                    logger.verbose(
                      `   [Debug] Flushed final tool call buffer: ${parsedToolCalls.length} tool calls`
                    );
                  } else {
                    safeEnqueue(
                      new TextEncoder().encode(
                        createOpenAIStreamChunk(
                          streamId,
                          model,
                          toolCallBuffer
                        )
                      )
                    );
                  }
                  toolCallBuffer = "";
                  inToolCall = false;
                }

                const finishReason =
                  toolCallIndex > 0 ? "tool_calls" : "stop";

                safeEnqueue(
                  new TextEncoder().encode(
                    createOpenAIStreamChunk(
                      streamId,
                      model,
                      undefined,
                      finishReason as "stop" | "length",
                      {
                        prompt_tokens: usageInputTokens,
                        completion_tokens: usageOutputTokens,
                        total_tokens: usageInputTokens + usageOutputTokens,
                        prompt_tokens_details: {
                          cached_tokens: usageCacheReadTokens,
                        },
                        completion_tokens_details: {
                          reasoning_tokens: 0,
                        },
                      }
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
