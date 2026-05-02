import { describe, expect, test } from "bun:test";
import type { ThinkingEffort } from "./model-settings";
import { getApiModelId, getSuggestedMaxTokens, type ModelSettings } from "./model-settings";
import {
  extractToolName,
  openaiToAnthropicBase,
  responsesInputToChatMessages,
} from "./openai-adapter";
import { applyThinkingToBody, pickRoute } from "./routing-policy";

function createRequest(model = "claude-code") {
  return {
    model,
    messages: [{ role: "user" as const, content: "Hello" }],
    max_tokens: 1024,
  };
}

function convert(
  request: ReturnType<typeof createRequest> & { reasoning_effort?: ThinkingEffort },
  settings: ModelSettings,
) {
  const apiModelId = getApiModelId(settings.selectedModel);
  const base = openaiToAnthropicBase(request, apiModelId);
  const clientEffort = request.reasoning_effort ?? null;
  const decision = pickRoute({ settings, clientEffort });
  return applyThinkingToBody(base, decision, request.max_tokens, undefined, apiModelId);
}

describe("openaiToAnthropic", () => {
  test("rejects requests with a malformed model slug", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
    };
    expect(() => convert(createRequest("Claude Code"), settings)).toThrow(
      'Invalid model "Claude Code": expected a non-empty model slug (e.g. "gpt-5.5").',
    );
  });

  test("accepts any reasonable model slug from the client", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: false,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
    };
    expect(() => convert(createRequest("gpt-5.5"), settings)).not.toThrow();
    expect(() => convert(createRequest("gpt-4o"), settings)).not.toThrow();
    expect(() => convert(createRequest("claude-sonnet-4-5"), settings)).not.toThrow();
    expect(() => convert(createRequest("claude-code"), settings)).not.toThrow();
  });

  test("uses selectedModel and omits thinking when thinkingEnabled=false", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-haiku-4-5",
      thinkingEnabled: false,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
    };

    const result = convert(createRequest(), settings);

    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.thinking).toBeUndefined();
    expect(result.output_config).toBeUndefined();
    expect(result.temperature).toBeUndefined();
    expect(result.max_tokens).toBe(1024);
  });

  test("uses selectedModel and saved effort when thinkingEnabled=true", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-sonnet-4-6",
      thinkingEnabled: true,
      thinkingEffort: "low",
      subscriptionPlan: "max20x",
    };

    const result = convert(createRequest(), settings);

    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.thinking).toEqual({ type: "adaptive" });
    expect(result.output_config).toEqual({ effort: "low" });
    expect(result.temperature).toBe(1);
    expect(result.max_tokens).toBe(getSuggestedMaxTokens("low"));
  });

  test("respects reasoning_effort from client over stored settings", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
    };

    const request = { ...createRequest(), reasoning_effort: "low" as const };
    const result = convert(request, settings);

    expect(result.thinking).toEqual({ type: "adaptive" });
    expect(result.output_config).toEqual({ effort: "low" });
  });

  test("accepts xhigh from reasoning_effort when stored settings allow", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "max",
      subscriptionPlan: "max20x",
    };

    const request = { ...createRequest(), reasoning_effort: "xhigh" as const };
    const result = convert(request, settings);

    expect(result.output_config).toEqual({ effort: "xhigh" });
  });

  test("caps client reasoning_effort to stored effort", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "medium",
      subscriptionPlan: "max20x",
    };

    const request = { ...createRequest(), reasoning_effort: "max" as const };
    const result = convert(request, settings);

    expect(result.output_config).toEqual({ effort: "medium" });
  });

  test("falls back to stored settings when reasoning_effort is absent", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
    };

    const result = convert(createRequest(), settings);

    expect(result.thinking).toEqual({ type: "adaptive" });
    expect(result.output_config).toEqual({ effort: "high" });
  });

  test("maps opus to correct API model ID", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: false,
      thinkingEffort: "medium",
      subscriptionPlan: "max20x",
    };

    const result = convert(createRequest(), settings);

    expect(result.model).toBe("claude-opus-4-7");
  });

  test("converts an OpenAI Responses API flat tool to Anthropic with input_schema", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: false,
      thinkingEffort: "medium",
      subscriptionPlan: "max20x",
    };

    const request = {
      ...createRequest(),
      tools: [
        {
          type: "function" as const,
          name: "search_docs",
          description: "look up docs",
          parameters: { type: "object", properties: { q: { type: "string" } } },
          strict: true,
        },
      ],
    };
    const result = convert(request, settings);

    expect(result.tools).toEqual([
      {
        name: "search_docs",
        description: "look up docs",
        input_schema: { type: "object", properties: { q: { type: "string" } } },
      },
    ]);
  });
});

describe("extractToolName", () => {
  test("reads name from OpenAI Chat Completions nested shape", () => {
    expect(extractToolName({ type: "function", function: { name: "alpha", parameters: {} } })).toBe(
      "alpha",
    );
  });

  test("reads name from OpenAI Responses API flat shape", () => {
    expect(extractToolName({ type: "function", name: "beta", parameters: {} })).toBe("beta");
  });

  test("reads name from Anthropic-direct shape", () => {
    expect(extractToolName({ name: "gamma", input_schema: {} })).toBe("gamma");
  });

  test("returns undefined for malformed entries", () => {
    expect(extractToolName(null)).toBeUndefined();
    expect(extractToolName({})).toBeUndefined();
    expect(extractToolName({ type: "function" })).toBeUndefined();
    expect(extractToolName({ type: "function", function: {} })).toBeUndefined();
  });
});

describe("responsesInputToChatMessages", () => {
  test("translates message envelopes with input_text content parts", () => {
    expect(
      responsesInputToChatMessages([
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Hello" }],
        },
      ]),
    ).toEqual([{ role: "user", content: [{ type: "text", text: "Hello" }] }]);
  });

  test("maps the developer role to system", () => {
    expect(
      responsesInputToChatMessages([
        { type: "message", role: "developer", content: "Be concise." },
      ]),
    ).toEqual([{ role: "system", content: "Be concise." }]);
  });

  test("batches consecutive function_call items into one assistant message", () => {
    const out = responsesInputToChatMessages([
      { type: "function_call", call_id: "fc_1", name: "search", arguments: '{"q":"a"}' },
      { type: "function_call", call_id: "fc_2", name: "search", arguments: '{"q":"b"}' },
      { type: "function_call_output", call_id: "fc_1", output: "result A" },
      { type: "function_call_output", call_id: "fc_2", output: "result B" },
    ]);
    expect(out).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "fc_1", type: "function", function: { name: "search", arguments: '{"q":"a"}' } },
          { id: "fc_2", type: "function", function: { name: "search", arguments: '{"q":"b"}' } },
        ],
      },
      { role: "tool", tool_call_id: "fc_1", content: "result A" },
      { role: "tool", tool_call_id: "fc_2", content: "result B" },
    ]);
  });

  test("flushes pending tool_calls before the next user message", () => {
    const out = responsesInputToChatMessages([
      { type: "message", role: "user", content: "before" },
      { type: "function_call", call_id: "fc_1", name: "x", arguments: "{}" },
      { type: "message", role: "user", content: "after" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "before" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "fc_1", type: "function", function: { name: "x", arguments: "{}" } }],
      },
      { role: "user", content: "after" },
    ]);
  });

  test("drops reasoning items silently", () => {
    expect(
      responsesInputToChatMessages([
        { type: "reasoning", summary: "..." },
        { type: "message", role: "user", content: "hi" },
      ]),
    ).toEqual([{ role: "user", content: "hi" }]);
  });
});
