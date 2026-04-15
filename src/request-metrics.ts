/**
 * Computes shape metrics for an incoming proxy request, for analytics only.
 * Must be called BEFORE `prepareClaudeCodeBody`, so the system prompt seen
 * here is the client's (Cursor) prompt, not the injected Claude Code prefix.
 */

import { createHash } from "node:crypto";
import type { AnthropicRequest, ContentBlock, RequestShapeMetrics } from "./types";

function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function extractSystemText(system: AnthropicRequest["system"]): string {
  if (!system) return "";
  if (typeof system === "string") return system;
  return system
    .map((b) => (b && typeof b === "object" && b.type === "text" ? (b.text ?? "") : ""))
    .join("\n")
    .trim();
}

function blocksOf(content: ContentBlock[] | string | undefined): ContentBlock[] {
  if (!content || typeof content === "string") return [];
  return content;
}

export function computeRequestShape(
  body: AnthropicRequest,
  route: "anthropic" | "openai",
  clientReasoningEffort: string | null,
): RequestShapeMetrics {
  const messages = body.messages ?? [];
  const messageCount = messages.length;

  let toolUseCount = 0;
  let toolResultCount = 0;
  for (const msg of messages) {
    for (const block of blocksOf(msg.content as ContentBlock[] | string | undefined)) {
      if (block?.type === "tool_use") toolUseCount++;
      else if (block?.type === "tool_result") toolResultCount++;
    }
  }

  const lastMsg = messages[messages.length - 1];
  const lastMsgRole = lastMsg?.role ?? null;
  const lastMsgHasToolResult = lastMsg
    ? blocksOf(lastMsg.content as ContentBlock[] | string | undefined).some(
        (b) => b?.type === "tool_result",
      )
    : false;

  const tools = body.tools ?? [];
  const toolDefsCount = tools.length;
  const toolDefsHash = toolDefsCount
    ? shortHash(
        tools
          .map((t) => t?.name ?? "")
          .sort()
          .join(","),
      )
    : null;

  const systemText = extractSystemText(body.system);
  const clientSystemHash = systemText ? shortHash(systemText) : null;

  return {
    route,
    messageCount,
    lastMsgRole,
    lastMsgHasToolResult,
    toolUseCount,
    toolResultCount,
    toolDefsCount,
    toolDefsHash,
    clientSystemHash,
    clientReasoningEffort,
  };
}
