import { describe, expect, mock, test } from "bun:test";
import type { AnthropicRequest } from "../types";

const SKIP = !!process.env.SKIP_MOCK_MODULE_TESTS;

if (!SKIP) {
  let currentModelSettings: {
    selectedModel: string;
    subscriptionPlan: string;
  } = {
    selectedModel: "claude-opus-4-7",
    subscriptionPlan: "max20x",
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
    test("forwards the request with the configured API model id", async () => {
      proxiedBody = undefined;
      currentModelSettings = {
        selectedModel: "claude-opus-4-7",
        subscriptionPlan: "max20x",
      };
      proxyResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "Claude Code",
          max_tokens: 512,
          messages: [{ role: "user", content: "Hello" }],
        } satisfies AnthropicRequest),
      });

      const response = await handleAnthropicMessages(request);

      expect(response.status).toBe(200);
      expect(proxiedBody).toBeDefined();
      const body1 = proxiedBody as unknown as AnthropicRequest;
      expect(body1.model).toBe("claude-opus-4-7");
      expect(body1.max_tokens).toBe(512);
    });

    test("rewrites the native sync response model back to Claude Code", async () => {
      proxiedBody = undefined;
      currentModelSettings = {
        selectedModel: "claude-sonnet-4-6",
        subscriptionPlan: "max20x",
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
      proxiedBody = undefined;
      currentModelSettings = {
        selectedModel: "claude-haiku-4-5",
        subscriptionPlan: "max20x",
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

    test("preserves client max_tokens when provided", async () => {
      proxiedBody = undefined;
      currentModelSettings = {
        selectedModel: "claude-opus-4-7",
        subscriptionPlan: "max20x",
      };
      proxyResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "Claude Code",
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
      const body = proxiedBody as unknown as AnthropicRequest;
      expect(body.model).toBe("claude-opus-4-7");
      expect(body.max_tokens).toBe(1024);
    });
  });
} else {
  test.skip("handleAnthropicMessages (skipped: SKIP_MOCK_MODULE_TESTS)", () => {});
}
