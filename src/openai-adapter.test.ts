import { describe, expect, test } from "bun:test";
import { DEFAULT_MODEL_SETTINGS, type ModelSettings } from "./model-settings";
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
      openaiToAnthropic(createRequest("claude-opus-4-6"), DEFAULT_MODEL_SETTINGS),
    ).toThrow('Invalid model "claude-opus-4-6": only "Claude Code" is supported.');
  });

  test("uses selectedModel and omits thinking when thinkingEnabled=false", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-haiku-4-5",
      thinkingEnabled: false,
      thinkingEffort: "high",
    };

    const result = openaiToAnthropic(createRequest(), settings);

    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.thinking).toBeUndefined();
    expect(result.temperature).toBeUndefined();
    expect(result.max_tokens).toBe(1024);
  });

  test("uses selectedModel and saved thinking budget when thinkingEnabled=true", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-sonnet-4-6",
      thinkingEnabled: true,
      thinkingEffort: "low",
    };

    const result = openaiToAnthropic(createRequest(), settings);

    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.thinking).toEqual({
      type: "enabled",
      budget_tokens: 4096,
    });
    expect(result.temperature).toBe(1);
    expect(result.max_tokens).toBe(20480);
  });
});
