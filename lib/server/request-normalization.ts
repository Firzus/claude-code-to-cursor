import type { AnthropicMessage, AnthropicRequest, ContentBlock } from "./types";

export const TOOL_PREFIX = "mcp_";

export function stripMcpPrefix(name: string | undefined | null): string {
  if (!name) return "";
  return name.startsWith(TOOL_PREFIX) ? name.slice(TOOL_PREFIX.length) : name;
}

type ToolIdState = {
  idMap: Map<string, string>;
  usedIds: Set<string>;
  nextFallback: number;
};

function sanitizeToolIdBase(id: string): string {
  return id
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getUniqueToolId(originalId: string, state: ToolIdState): string {
  const existing = state.idMap.get(originalId);
  if (existing) {
    return existing;
  }

  const baseCandidate = sanitizeToolIdBase(originalId);
  const baseId = baseCandidate || `toolcall_${state.nextFallback++}`;
  let candidate = baseId;
  let suffix = 1;

  while (state.usedIds.has(candidate)) {
    candidate = `${baseId}_${suffix}`;
    suffix++;
  }

  state.idMap.set(originalId, candidate);
  state.usedIds.add(candidate);
  return candidate;
}

function normalizeContentBlocks(content: ContentBlock[], state: ToolIdState): ContentBlock[] {
  return content.map((block) => {
    const normalizedBlock: ContentBlock = { ...block };

    if (block.type === "tool_use") {
      normalizedBlock.id = getUniqueToolId(block.id || "", state);
    }

    if (block.type === "tool_result" && block.tool_use_id) {
      normalizedBlock.tool_use_id = getUniqueToolId(block.tool_use_id, state);
    }

    if (Array.isArray(block.content)) {
      normalizedBlock.content = normalizeContentBlocks(block.content, state);
    }

    return normalizedBlock;
  });
}

export function normalizeAnthropicRequestModel(
  request: AnthropicRequest,
  model: string,
): AnthropicRequest {
  return {
    ...request,
    model,
  };
}

/**
 * Upstream rejects requests whose last message has role `assistant` with:
 *   "This model does not support assistant message prefill.
 *    The conversation must end with a user message."
 * Append a minimal user nudge when that happens (e.g. an assistant `tool_use`
 * sent without its paired `tool_result`).
 */
export function ensureTrailingUserMessage(request: AnthropicRequest): AnthropicRequest {
  const messages = request.messages;
  if (!messages || messages.length === 0) return request;

  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return request;

  return {
    ...request,
    messages: [...messages, { role: "user", content: "Continue." }],
  };
}

export function normalizeAnthropicToolIds(request: AnthropicRequest): AnthropicRequest {
  const state: ToolIdState = {
    idMap: new Map(),
    usedIds: new Set(),
    nextFallback: 1,
  };

  const messages: AnthropicMessage[] = request.messages.map((message) => ({
    ...message,
    content: Array.isArray(message.content)
      ? normalizeContentBlocks(message.content, state)
      : message.content,
  }));

  return {
    ...request,
    messages,
  };
}
