import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL_SETTINGS,
  getApiModelId,
  getContextLength,
  getExposedModels,
  getPlanQuotas,
  getSuggestedMaxTokens,
  isAllowedPublicModel,
  isValidSubscriptionPlan,
  isValidThinkingEffort,
  PUBLIC_MODEL_ID,
  SUPPORTED_PLANS,
  VALID_EFFORTS,
  validateModelSettings,
} from "./model-settings";

describe("model settings contract", () => {
  test("locks the public model id contract", () => {
    expect(PUBLIC_MODEL_ID).toBe("gpt-5.5");
    expect(getExposedModels()).toEqual(["gpt-5.5"]);
    expect(isAllowedPublicModel("gpt-5.5")).toBe(true);
    expect(isAllowedPublicModel("gpt-4o")).toBe(true);
    expect(isAllowedPublicModel("claude-sonnet-4-5")).toBe(true);
    expect(isAllowedPublicModel("claude-code")).toBe(true);
    expect(isAllowedPublicModel("cctc-claude-opus-4-7")).toBe(true);
    expect(isAllowedPublicModel("foo")).toBe(true);
    expect(isAllowedPublicModel("")).toBe(false);
    expect(isAllowedPublicModel("Claude Code")).toBe(false);
    expect(isAllowedPublicModel("-foo")).toBe(false);
    expect(isAllowedPublicModel("foo bar")).toBe(false);
  });

  test("locks the default model settings", () => {
    expect(DEFAULT_MODEL_SETTINGS).toEqual({
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
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

  test.each([
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ])("isValidThinkingEffort accepts %s", (effort) => {
    expect(isValidThinkingEffort(effort)).toBe(true);
  });

  test.each([
    "ultra",
    "",
    "HIGH",
    null,
    undefined,
    42,
  ])("isValidThinkingEffort rejects %p", (value) => {
    expect(isValidThinkingEffort(value)).toBe(false);
  });

  test("accepts valid model settings payloads", () => {
    expect(validateModelSettings(DEFAULT_MODEL_SETTINGS)).toEqual(DEFAULT_MODEL_SETTINGS);
    expect(
      validateModelSettings({
        selectedModel: "claude-sonnet-4-6",
        thinkingEnabled: false,
        thinkingEffort: "low",
        subscriptionPlan: "pro",
      }),
    ).toEqual({
      selectedModel: "claude-sonnet-4-6",
      thinkingEnabled: false,
      thinkingEffort: "low",
      subscriptionPlan: "pro",
    });
    expect(
      validateModelSettings({
        selectedModel: "claude-opus-4-6",
        thinkingEnabled: true,
        thinkingEffort: "high",
        subscriptionPlan: "max20x",
      }),
    ).toEqual({
      selectedModel: "claude-opus-4-6",
      thinkingEnabled: true,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
    });
    expect(
      validateModelSettings({
        selectedModel: "claude-haiku-4-5",
        thinkingEnabled: true,
        thinkingEffort: "medium",
        subscriptionPlan: "max5x",
      }),
    ).toEqual({
      selectedModel: "claude-haiku-4-5",
      thinkingEnabled: true,
      thinkingEffort: "medium",
      subscriptionPlan: "max5x",
    });
    expect(
      validateModelSettings({
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: true,
        thinkingEffort: "xhigh",
        subscriptionPlan: "max20x",
      }),
    ).toEqual({
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "xhigh",
      subscriptionPlan: "max20x",
    });
    expect(
      validateModelSettings({
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: true,
        thinkingEffort: "max",
        subscriptionPlan: "max20x",
      }),
    ).toEqual({
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "max",
      subscriptionPlan: "max20x",
    });
  });

  test("falls back to default plan when subscriptionPlan is missing (legacy payloads)", () => {
    expect(
      validateModelSettings({
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: true,
        thinkingEffort: "high",
      }),
    ).toEqual({
      selectedModel: "claude-opus-4-7",
      thinkingEnabled: true,
      thinkingEffort: "high",
      subscriptionPlan: "max20x",
    });
  });

  test("rejects invalid subscriptionPlan values", () => {
    expect(() =>
      validateModelSettings({
        ...DEFAULT_MODEL_SETTINGS,
        subscriptionPlan: "enterprise",
      }),
    ).toThrow();
  });

  test("exposes the 3 supported subscription plans", () => {
    expect(SUPPORTED_PLANS).toEqual(["pro", "max5x", "max20x"]);
  });

  test.each(["pro", "max5x", "max20x"])("isValidSubscriptionPlan accepts %s", (plan) => {
    expect(isValidSubscriptionPlan(plan)).toBe(true);
  });

  test.each([
    "PRO",
    "",
    null,
    undefined,
    42,
    "enterprise",
  ])("isValidSubscriptionPlan rejects %p", (value) => {
    expect(isValidSubscriptionPlan(value)).toBe(false);
  });

  test.each([
    ["pro", 44_000, 1_500_000],
    ["max5x", 88_000, 7_500_000],
    ["max20x", 220_000, 30_000_000],
  ])("returns plan quotas for %s", (plan, fiveHour, weekly) => {
    expect(getPlanQuotas(plan as "pro" | "max5x" | "max20x")).toEqual({
      fiveHourTokens: fiveHour,
      weeklyTokens: weekly,
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
    expect(getApiModelId("claude-opus-4-6")).toBe("claude-opus-4-6");
    expect(getApiModelId("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(getApiModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  test("returns correct context length per model", () => {
    expect(getContextLength("claude-opus-4-7")).toBe(1000000);
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
