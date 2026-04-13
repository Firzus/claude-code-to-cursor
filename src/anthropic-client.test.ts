import { describe, expect, test } from "bun:test";
import { applyCacheTtl } from "./anthropic-client";
import type { AnthropicRequest } from "./types";

function makeRequest(): AnthropicRequest {
  return {
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "hello", cache_control: { type: "ephemeral" } }],
      },
    ],
    system: [{ type: "text", text: "you are claude", cache_control: { type: "ephemeral" } }],
    tools: [
      {
        name: "grep",
        description: "",
        input_schema: { type: "object", properties: {} },
        cache_control: { type: "ephemeral" },
      },
    ],
  } as unknown as AnthropicRequest;
}

describe("applyCacheTtl", () => {
  test("5m strips ttl from every cache_control block (system, messages, tools)", () => {
    const req = makeRequest();
    // Simulate Cursor sending stale ttl values
    (req.system as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control.ttl = "1h";
    const firstUserBlock = (
      req.messages[0]!.content as Array<{ cache_control: Record<string, unknown> }>
    )[0]!;
    firstUserBlock.cache_control.ttl = "1h";
    (req.tools as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control.ttl = "1h";

    applyCacheTtl(req, "5m");

    expect(
      (req.system as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control,
    ).toEqual({
      type: "ephemeral",
    });
    expect(firstUserBlock.cache_control).toEqual({ type: "ephemeral" });
    expect(
      (req.tools as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control,
    ).toEqual({ type: "ephemeral" });
  });

  test("1h stamps ttl: '1h' on every cache_control block (system, messages, tools)", () => {
    const req = makeRequest();

    applyCacheTtl(req, "1h");

    expect(
      (req.system as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control,
    ).toEqual({
      type: "ephemeral",
      ttl: "1h",
    });
    expect(
      (req.messages[0]!.content as Array<{ cache_control: Record<string, unknown> }>)[0]!
        .cache_control,
    ).toEqual({
      type: "ephemeral",
      ttl: "1h",
    });
    expect(
      (req.tools as Array<{ cache_control: Record<string, unknown> }>)[0]!.cache_control,
    ).toEqual({
      type: "ephemeral",
      ttl: "1h",
    });
  });

  test("leaves blocks without cache_control untouched", () => {
    const req: AnthropicRequest = {
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "plain" }],
        },
      ],
    } as AnthropicRequest;

    applyCacheTtl(req, "1h");

    const block = (req.messages[0]!.content as unknown as Array<Record<string, unknown>>)[0]!;
    expect(block.cache_control).toBeUndefined();
  });

  test("handles tools array without cache_control", () => {
    const req: AnthropicRequest = {
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          name: "read",
          description: "",
          input_schema: { type: "object", properties: {} },
        },
      ],
    } as unknown as AnthropicRequest;

    // Should not throw on tools without cache_control
    expect(() => applyCacheTtl(req, "1h")).not.toThrow();
    expect(
      (req.tools as unknown as Array<Record<string, unknown>>)[0]!.cache_control,
    ).toBeUndefined();
  });
});
