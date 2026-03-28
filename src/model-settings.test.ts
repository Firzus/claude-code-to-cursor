import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL_SETTINGS,
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
    });
  });

  test.each([
    ["low", 4096],
    ["medium", 8192],
    ["high", 16384],
  ])("maps %s thinking effort to %i tokens", (effort, budget) => {
    expect(getThinkingBudget(effort as "low" | "medium" | "high")).toBe(budget);
  });

  test("accepts valid model settings payloads", () => {
    expect(validateModelSettings(DEFAULT_MODEL_SETTINGS)).toEqual(DEFAULT_MODEL_SETTINGS);
  });

  test("rejects unsupported selectedModel values", () => {
    expect(() =>
      validateModelSettings({
        ...DEFAULT_MODEL_SETTINGS,
        selectedModel: "claude-sonnet-4-6",
      }),
    ).toThrow();
  });
});
