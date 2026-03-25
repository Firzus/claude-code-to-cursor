import type { AnthropicMessage, AnthropicRequest, ContentBlock } from "./types";

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

function normalizeContentBlocks(
  content: ContentBlock[],
  state: ToolIdState
): ContentBlock[] {
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
  model: string
): AnthropicRequest {
  return {
    ...request,
    model,
  };
}

export function normalizeAnthropicToolIds(
  request: AnthropicRequest
): AnthropicRequest {
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

export function normalizeAnthropicRequest(
  request: AnthropicRequest,
  model: string
): AnthropicRequest {
  return normalizeAnthropicToolIds(
    normalizeAnthropicRequestModel(request, model)
  );
}
