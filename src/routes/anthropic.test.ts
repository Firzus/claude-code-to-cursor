import { describe, expect, mock, test } from "bun:test";
import type { AnthropicRequest } from "../types";

const SKIP = !!process.env.SKIP_MOCK_MODULE_TESTS;

if (!SKIP) {
  let currentModelSettings: {
    selectedModel: string;
    thinkingEnabled: boolean;
    thinkingEffort: string;
  } = {
    selectedModel: "claude-opus-4-7",
    thinkingEnabled: false,
    thinkingEffort: "high",
  };

  let proxiedBody: AnthropicRequest | undefined;
  let proxyResponse: Response | undefined;

  mock.module("../db", () => ({
    getDb: () => null,
    getModelSettings: () => currentModelSettings,
    saveModelSettings: () => {},
    recordRequest: () => {},
    getAnalytics: () => ({}),
    getRecentRequests: () => ({}),
    getAnalyticsTimeline: () => ({}),
    resetAnalytics: () => ({}),
  }));

  mock.module("../anthropic-client", () => ({
    proxyRequest: async (_path: string, body: AnthropicRequest) => {
      proxiedBody = body;
      if (!proxyResponse) throw new Error("proxyResponse not set");
      return proxyResponse;
    },
  }));

  mock.module("../middleware", () => ({
    logRequestDetails: () => {},
    corsHeaders: () => ({}),
  }));

  mock.module("../logger", () => ({
    logger: { info: () => {}, warn: () => {}, error: () => {}, verbose: () => {} },
  }));

  const { handleAnthropicMessages } = await import("./anthropic");

  describe("handleAnthropicMessages", () => {
    test("removes client thinking controls when saved settings disable thinking", async () => {
      proxiedBody = undefined;
      currentModelSettings = {
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: false,
        thinkingEffort: "high",
      };
      proxyResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-code",
          max_tokens: 512,
          messages: [{ role: "user", content: "Hello" }],
          reasoning_budget: "high",
          thinking: { type: "enabled", budget_tokens: 16384 },
        } satisfies AnthropicRequest),
      });

      const response = await handleAnthropicMessages(request);

      expect(response.status).toBe(200);
      expect(proxiedBody).toBeDefined();
      const body1 = proxiedBody as unknown as AnthropicRequest;
      expect(body1.model).toBe("claude-opus-4-7");
      expect(body1.thinking).toBeUndefined();
      expect("reasoning_budget" in body1).toBe(false);
    });

    test("echoes the client model back in native sync responses", async () => {
      proxiedBody = undefined;
      currentModelSettings = {
        selectedModel: "claude-sonnet-4-6",
        thinkingEnabled: true,
        thinkingEffort: "medium",
      };
      proxyResponse = new Response(
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
      );

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-code",
          max_tokens: 256,
          messages: [{ role: "user", content: "Hello" }],
        } satisfies AnthropicRequest),
      });

      const response = await handleAnthropicMessages(request);
      const body = (await response.json()) as { model: string };

      expect(response.status).toBe(200);
      expect(body.model).toBe("claude-code");
    });

    test("echoes the client model back in native SSE message_start", async () => {
      proxiedBody = undefined;
      currentModelSettings = {
        selectedModel: "claude-haiku-4-5",
        thinkingEnabled: true,
        thinkingEffort: "low",
      };
      proxyResponse = new Response(
        [
          "event: message_start\n",
          'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-haiku-4-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
          "event: message_stop\n",
          'data: {"type":"message_stop"}\n\n',
        ].join(""),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        },
      );

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-code",
          max_tokens: 256,
          stream: true,
          messages: [{ role: "user", content: "Hello" }],
        } satisfies AnthropicRequest),
      });

      const response = await handleAnthropicMessages(request);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain('"model":"claude-code"');
      expect(body).not.toContain('"model":"claude-haiku-4-5"');
    });

    test("continuation turn after tool_result uses stored adaptive thinking + effort", async () => {
      proxiedBody = undefined;
      currentModelSettings = {
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: true,
        thinkingEffort: "high",
      };
      proxyResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-code",
          max_tokens: 1024,
          messages: [
            {
              role: "assistant",
              content: [{ type: "tool_use", id: "tu_1", name: "grep", input: { pattern: "foo" } }],
            },
            {
              role: "user",
              content: [{ type: "tool_result", tool_use_id: "tu_1", content: "bar" }],
            },
          ],
        } satisfies AnthropicRequest),
      });

      const response = await handleAnthropicMessages(request);

      expect(response.status).toBe(200);
      expect(proxiedBody).toBeDefined();
      const body4 = proxiedBody as unknown as AnthropicRequest;
      expect(body4.model).toBe("claude-opus-4-7");
      expect(body4.thinking).toEqual({ type: "adaptive" });
      expect(body4.output_config).toEqual({ effort: "high" });
    });

    test("respects xhigh from client reasoning_budget when stored cap allows it", async () => {
      proxiedBody = undefined;
      currentModelSettings = {
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: true,
        thinkingEffort: "max",
      };
      proxyResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-code",
          max_tokens: 1024,
          messages: [{ role: "user", content: "Hello" }],
          reasoning_budget: "xhigh",
        } satisfies AnthropicRequest),
      });

      const response = await handleAnthropicMessages(request);

      expect(response.status).toBe(200);
      const body5 = proxiedBody as unknown as AnthropicRequest;
      expect(body5.thinking).toEqual({ type: "adaptive" });
      expect(body5.output_config).toEqual({ effort: "xhigh" });
    });
  });
} else {
  test.skip("handleAnthropicMessages (skipped: SKIP_MOCK_MODULE_TESTS)", () => {});
}
