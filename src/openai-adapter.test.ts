import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL_SETTINGS,
  getSuggestedMaxTokens,
  type ModelSettings,
} from "./model-settings";
import { openaiToAnthropic } from "./openai-adapter";

function createRequest(model = "Claude Code") {
  return {
    model,
    messages: [{ role: "user" as const, content: "Hello" }],
    max_tokens: 1024,
  };
}

describe("openaiToAnthropic", () => {
  test('rejects requests whose model is not "Claude Code"', () => {
    expect(() =>
      openaiToAnthropic(createRequest("claude-opus-4-7"), DEFAULT_MODEL_SETTINGS),
    ).toThrow('Invalid model "claude-opus-4-7": only "Claude Code" is supported.');
  });

  test("uses selectedModel and omits thinking when thinkingEnabled=false", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-haiku-4-5",
      thinkingEnabled: false,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
    };

    const result = openaiToAnthropic(createRequest(), settings);

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

    const result = openaiToAnthropic(createRequest(), settings);

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

    const request = {
      ...createRequest(),
      reasoning_effort: "low" as const,
    };

    const result = openaiToAnthropic(request, settings);

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

    const request = {
      ...createRequest(),
      reasoning_effort: "xhigh" as const,
    };

    const result = openaiToAnthropic(request, settings);

    expect(result.output_config).toEqual({ effort: "xhigh" });
  });

  test("caps client reasoning_effort to stored effort", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "medium",
      subscriptionPlan: "max20x",
    };

    const request = {
      ...createRequest(),
      reasoning_effort: "max" as const,
    };

    const result = openaiToAnthropic(request, settings);

    expect(result.output_config).toEqual({ effort: "medium" });
  });

  test("falls back to stored settings when reasoning_effort is absent", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
    };

    const result = openaiToAnthropic(createRequest(), settings);

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

    const result = openaiToAnthropic(createRequest(), settings);

    expect(result.model).toBe("claude-opus-4-7");
  });
});
