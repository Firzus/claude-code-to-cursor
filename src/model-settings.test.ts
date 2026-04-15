import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL_SETTINGS,
  getApiModelId,
  getContextLength,
  getExposedModels,
  getThinkingBudget,
  isAllowedPublicModel,
  PUBLIC_MODEL_ID,
  validateModelSettings,
} from "./model-settings";

describe("model settings contract", () => {
  test("locks the public model id contract", () => {
    expect(PUBLIC_MODEL_ID).toBe("Claude Code");
    expect(getExposedModels()).toEqual(["Claude Code"]);
    expect(isAllowedPublicModel("Claude Code")).toBe(true);
    expect(isAllowedPublicModel("claude-opus-4-6")).toBe(false);
    expect(isAllowedPublicModel("claude-sonnet-4-6")).toBe(false);
    expect(isAllowedPublicModel("claude-haiku-4-5")).toBe(false);
  });

  test("locks the default model settings", () => {
    expect(DEFAULT_MODEL_SETTINGS).toEqual({
      selectedModel: "claude-opus-4-6",
      thinkingEnabled: true,
      thinkingEffort: "high",
      cacheTTL: "5m",
    });
  });

  test.each([
    ["low", 2048],
    ["medium", 4096],
    ["high", 8192],
  ])("maps %s thinking effort to %i tokens", (effort, budget) => {
    expect(getThinkingBudget(effort as "low" | "medium" | "high")).toBe(budget);
  });

  test("accepts valid model settings payloads", () => {
    expect(validateModelSettings(DEFAULT_MODEL_SETTINGS)).toEqual(DEFAULT_MODEL_SETTINGS);
    expect(
      validateModelSettings({
        selectedModel: "claude-sonnet-4-6",
        thinkingEnabled: false,
        thinkingEffort: "low",
        cacheTTL: "1h",
      }),
    ).toEqual({
      selectedModel: "claude-sonnet-4-6",
      thinkingEnabled: false,
      thinkingEffort: "low",
      cacheTTL: "1h",
    });
    expect(
      validateModelSettings({
        selectedModel: "claude-haiku-4-5",
        thinkingEnabled: true,
        thinkingEffort: "medium",
        cacheTTL: "5m",
      }),
    ).toEqual({
      selectedModel: "claude-haiku-4-5",
      thinkingEnabled: true,
      thinkingEffort: "medium",
      cacheTTL: "5m",
    });
  });

  test("rejects invalid cacheTTL values", () => {
    expect(() =>
      validateModelSettings({
        ...DEFAULT_MODEL_SETTINGS,
        cacheTTL: "1d",
      }),
    ).toThrow(/cacheTTL/);
    expect(() => {
      const { cacheTTL: _omit, ...partial } = DEFAULT_MODEL_SETTINGS;
      return validateModelSettings(partial);
    }).toThrow(/cacheTTL/);
  });

  test("returns API model ID unchanged", () => {
    expect(getApiModelId("claude-opus-4-6")).toBe("claude-opus-4-6");
    expect(getApiModelId("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(getApiModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  test("returns correct context length per model", () => {
    expect(getContextLength("claude-opus-4-6")).toBe(1000000);
    expect(getContextLength("claude-sonnet-4-6")).toBe(200000);
    expect(getContextLength("claude-haiku-4-5")).toBe(200000);
  });

  test("rejects unsupported selectedModel values", () => {
    expect(() =>
      validateModelSettings({
        ...DEFAULT_MODEL_SETTINGS,
        selectedModel: "Claude Code",
      }),
    ).toThrow();
  });
});
