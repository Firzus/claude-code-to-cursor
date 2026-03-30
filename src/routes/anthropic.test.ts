import { describe, expect, mock, test } from "bun:test";
import type { AnthropicRequest } from "../types";

describe("handleAnthropicMessages", () => {
  test("removes client thinking controls when saved settings disable thinking", async () => {
    let proxiedBody: AnthropicRequest | undefined;

    mock.module("../db", () => ({
      getModelSettings: () => ({
        selectedModel: "claude-opus-4-6" as const,
        thinkingEnabled: false,
        thinkingEffort: "high" as const,
      }),
      saveModelSettings: () => {},
      recordRequest: () => {},
    }));

    mock.module("../anthropic-client", () => ({
      proxyRequest: async (_path: string, body: AnthropicRequest) => {
        proxiedBody = body;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    }));

    const { handleAnthropicMessages } = await import("./anthropic");

    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "Claude Code",
        max_tokens: 512,
        messages: [{ role: "user", content: "Hello" }],
        reasoning_budget: "high",
        thinking: { type: "enabled", budget_tokens: 16384 },
      } satisfies AnthropicRequest),
    });

    const response = await handleAnthropicMessages(request);

    expect(response.status).toBe(200);
    expect(proxiedBody).toBeDefined();
    expect(proxiedBody?.model).toBe("claude-opus-4-6");
    expect(proxiedBody?.thinking).toBeUndefined();
    expect("reasoning_budget" in (proxiedBody as AnthropicRequest)).toBe(false);
  });

  test("rewrites the native sync response model back to Claude Code", async () => {
    mock.module("../db", () => ({
      getModelSettings: () => ({
        selectedModel: "claude-sonnet-4-6" as const,
        thinkingEnabled: true,
        thinkingEffort: "medium" as const,
      }),
      saveModelSettings: () => {},
      recordRequest: () => {},
    }));

    mock.module("../anthropic-client", () => ({
      proxyRequest: async () =>
        new Response(
          JSON.stringify({
            id: "msg_123",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "Hello" }],
            model: "claude-sonnet-4-6",
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    }));

    const { handleAnthropicMessages } = await import("./anthropic");

    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "Claude Code",
        max_tokens: 256,
        messages: [{ role: "user", content: "Hello" }],
      } satisfies AnthropicRequest),
    });

    const response = await handleAnthropicMessages(request);
    const body = (await response.json()) as { model: string };

    expect(response.status).toBe(200);
    expect(body.model).toBe("Claude Code");
  });

  test("rewrites the native SSE message_start model back to Claude Code", async () => {
    mock.module("../db", () => ({
      getModelSettings: () => ({
        selectedModel: "claude-haiku-4-5" as const,
        thinkingEnabled: true,
        thinkingEffort: "low" as const,
      }),
      saveModelSettings: () => {},
      recordRequest: () => {},
    }));

    mock.module("../anthropic-client", () => ({
      proxyRequest: async () =>
        new Response(
          [
            'event: message_start\n',
            'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-haiku-4-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
            'event: message_stop\n',
            'data: {"type":"message_stop"}\n\n',
          ].join(""),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          },
        ),
    }));

    const { handleAnthropicMessages } = await import("./anthropic");

    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "Claude Code",
        max_tokens: 256,
        stream: true,
        messages: [{ role: "user", content: "Hello" }],
      } satisfies AnthropicRequest),
    });

    const response = await handleAnthropicMessages(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"model":"Claude Code"');
    expect(body).not.toContain('"model":"claude-haiku-4-5"');
  });
});
