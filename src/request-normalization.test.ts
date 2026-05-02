import { describe, expect, test } from "bun:test";
import { normalizeAnthropicRequest } from "./request-normalization";
import type { AnthropicRequest } from "./types";

describe("normalizeAnthropicRequest", () => {
  test("normalizes the public Anthropic model alias and rewrites invalid tool ids consistently", () => {
    const input: AnthropicRequest = {
      model: "claude-code",
      max_tokens: 128,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_01?bad:id",
              name: "search_docs",
              input: { query: "ping" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_01?bad:id",
              content: "ok",
            },
          ],
        },
      ],
    };

    const normalized = normalizeAnthropicRequest(input, "claude-opus-4-7");
    const toolUse = normalized.messages[0]
      ?.content as AnthropicRequest["messages"][number]["content"];
    const toolResult = normalized.messages[1]
      ?.content as AnthropicRequest["messages"][number]["content"];

    expect(normalized.model).toBe("claude-opus-4-7");
    expect((toolUse as Array<{ id?: string }>)[0]?.id).toBe("toolu_01_bad_id");
    expect((toolResult as Array<{ tool_use_id?: string }>)[0]?.tool_use_id).toBe("toolu_01_bad_id");
    expect(input.model).toBe("claude-code");
    expect((input.messages[0]?.content as Array<{ id?: string }>)[0]?.id).toBe("toolu_01?bad:id");
  });

  test("keeps already valid ids unchanged", () => {
    const input: AnthropicRequest = {
      model: "claude-code",
      max_tokens: 64,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_valid-01",
              name: "search_docs",
              input: {},
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_valid-01",
              content: "ok",
            },
          ],
        },
      ],
    };

    const normalized = normalizeAnthropicRequest(input, "claude-sonnet-4-6");
    const toolUse = normalized.messages[0]?.content as Array<{ id?: string }>;
    const toolResult = normalized.messages[1]?.content as Array<{ tool_use_id?: string }>;

    expect(normalized.model).toBe("claude-sonnet-4-6");
    expect(toolUse[0]?.id).toBe("toolu_valid-01");
    expect(toolResult[0]?.tool_use_id).toBe("toolu_valid-01");
  });

  test("uses stable fallbacks and resolves collisions after sanitation", () => {
    const input: AnthropicRequest = {
      model: "claude-code",
      max_tokens: 64,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "???", name: "alpha", input: {} },
            { type: "tool_use", id: "a:b", name: "beta", input: {} },
            { type: "tool_use", id: "a?b", name: "gamma", input: {} },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "???", content: "first" },
            { type: "tool_result", tool_use_id: "a:b", content: "second" },
            { type: "tool_result", tool_use_id: "a?b", content: "third" },
          ],
        },
      ],
    };

    const normalized = normalizeAnthropicRequest(input, "claude-sonnet-4-6");
    const toolUses = normalized.messages[0]?.content as Array<{ id?: string }>;
    const toolResults = normalized.messages[1]?.content as Array<{ tool_use_id?: string }>;

    expect(toolUses.map((block) => block.id)).toEqual(["toolcall_1", "a_b", "a_b_1"]);
    expect(toolResults.map((block) => block.tool_use_id)).toEqual(["toolcall_1", "a_b", "a_b_1"]);
  });
});
