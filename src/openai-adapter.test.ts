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
      openaiToAnthropic(createRequest("claude-opus-4-7"), DEFAULT_MODEL_SETTINGS),
    ).toThrow('Invalid model "claude-opus-4-7": only "Claude Code" is supported.');
  });

  test("maps selectedModel to the API model id and passes through max_tokens", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-haiku-4-5",
      subscriptionPlan: "max20x",
    };

    const result = openaiToAnthropic(createRequest(), settings);

    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.max_tokens).toBe(1024);
  });

  test("maps sonnet to the correct API model ID", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-sonnet-4-6",
      subscriptionPlan: "max20x",
    };

    const result = openaiToAnthropic(createRequest(), settings);

    expect(result.model).toBe("claude-sonnet-4-6");
  });

  test("maps opus to the correct API model ID", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      subscriptionPlan: "max20x",
    };

    const result = openaiToAnthropic(createRequest(), settings);

    expect(result.model).toBe("claude-opus-4-7");
  });

  test("defaults max_tokens to 4096 when not provided", () => {
    const settings: ModelSettings = {
      selectedModel: "claude-opus-4-7",
      subscriptionPlan: "max20x",
    };

    const result = openaiToAnthropic(
      {
        model: "Claude Code",
        messages: [{ role: "user" as const, content: "Hello" }],
      },
      settings,
    );

    expect(result.max_tokens).toBe(4096);
  });
});
