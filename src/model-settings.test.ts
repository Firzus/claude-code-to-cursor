import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL_SETTINGS,
  getApiModelId,
  getContextLength,
  getExposedModels,
  getSuggestedMaxTokens,
  isAllowedPublicModel,
  isValidThinkingEffort,
  PUBLIC_MODEL_ID,
  VALID_EFFORTS,
  validateModelSettings,
} from "./model-settings";

describe("model settings contract", () => {
  test("locks the public model id contract", () => {
    expect(PUBLIC_MODEL_ID).toBe("Claude Code");
    expect(getExposedModels()).toEqual(["Claude Code"]);
    expect(isAllowedPublicModel("Claude Code")).toBe(true);
    expect(isAllowedPublicModel("claude-opus-4-7")).toBe(false);
    expect(isAllowedPublicModel("claude-sonnet-4-6")).toBe(false);
    expect(isAllowedPublicModel("claude-haiku-4-5")).toBe(false);
  });

  test("locks the default model settings", () => {
    expect(DEFAULT_MODEL_SETTINGS).toEqual({
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "high",
    });
  });

  test("exposes the 5 valid effort levels in rank order", () => {
    expect(VALID_EFFORTS).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  test.each([
    ["low", 8192],
    ["medium", 16384],
    ["high", 32768],
    ["xhigh", 65536],
    ["max", 65536],
  ])("suggests %i max_tokens for %s effort", (effort, suggested) => {
    expect(getSuggestedMaxTokens(effort as (typeof VALID_EFFORTS)[number])).toBe(suggested);
  });

  test.each(["low", "medium", "high", "xhigh", "max"])(
    "isValidThinkingEffort accepts %s",
    (effort) => {
      expect(isValidThinkingEffort(effort)).toBe(true);
    },
  );

  test.each(["ultra", "", "HIGH", null, undefined, 42])(
    "isValidThinkingEffort rejects %p",
    (value) => {
      expect(isValidThinkingEffort(value)).toBe(false);
    },
  );

  test("accepts valid model settings payloads", () => {
    expect(validateModelSettings(DEFAULT_MODEL_SETTINGS)).toEqual(DEFAULT_MODEL_SETTINGS);
    expect(
      validateModelSettings({
        selectedModel: "claude-sonnet-4-6",
        thinkingEnabled: false,
        thinkingEffort: "low",
      }),
    ).toEqual({
      selectedModel: "claude-sonnet-4-6",
      thinkingEnabled: false,
      thinkingEffort: "low",
    });
    expect(
      validateModelSettings({
        selectedModel: "claude-haiku-4-5",
        thinkingEnabled: true,
        thinkingEffort: "medium",
      }),
    ).toEqual({
      selectedModel: "claude-haiku-4-5",
      thinkingEnabled: true,
      thinkingEffort: "medium",
    });
    expect(
      validateModelSettings({
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: true,
        thinkingEffort: "xhigh",
      }),
    ).toEqual({
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "xhigh",
    });
    expect(
      validateModelSettings({
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: true,
        thinkingEffort: "max",
      }),
    ).toEqual({
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "max",
    });
  });

  test("rejects invalid thinkingEffort values", () => {
    expect(() =>
      validateModelSettings({
        ...DEFAULT_MODEL_SETTINGS,
        thinkingEffort: "ultra",
      }),
    ).toThrow();
  });

  test("returns API model ID unchanged", () => {
    expect(getApiModelId("claude-opus-4-7")).toBe("claude-opus-4-7");
    expect(getApiModelId("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(getApiModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  test("returns correct context length per model", () => {
    expect(getContextLength("claude-opus-4-7")).toBe(1000000);
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
