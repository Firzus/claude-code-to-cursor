import { createOpenAIStreamChunk, createOpenAIStreamStart } from "./openai-adapter";

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function parseResponseError(
  response: Response,
): Promise<{ message: string; type: string }> {
  const raw = await response
    .clone()
    .text()
    .catch(() => "");
  let message = `HTTP ${response.status}`;
  let type = "api_error";
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; type?: string } };
    if (parsed?.error?.message) message = parsed.error.message;
    if (parsed?.error?.type) type = parsed.error.type;
  } catch {
    if (raw) message = raw.substring(0, 200);
  }
  return { message, type };
}

/**
 * SSE tail: error content + stop + DONE.
 * Prepend `createOpenAIStreamStart` when no start chunk has been sent yet.
 */
export function createOpenAIErrorTail(streamId: string, model: string, errMsg: string): string {
  return (
    createOpenAIStreamChunk(streamId, model, `[Error: ${errMsg}]`) +
    createOpenAIStreamChunk(streamId, model, undefined, "stop") +
    "data: [DONE]\n\n"
  );
}

/** Full SSE error stream (start + error content + stop + DONE). */
export function createOpenAIErrorStream(streamId: string, model: string, errMsg: string): string {
  return createOpenAIStreamStart(streamId, model) + createOpenAIErrorTail(streamId, model, errMsg);
}

export function createAnthropicErrorSSE(type: string, message: string): string {
  return `event: error\ndata: ${JSON.stringify({ type: "error", error: { type, message } })}\n\n`;
}
