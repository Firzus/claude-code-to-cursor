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
});
