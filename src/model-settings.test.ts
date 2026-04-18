import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL_SETTINGS,
  getApiModelId,
  getContextLength,
  getExposedModels,
  getPlanQuotas,
  isAllowedPublicModel,
  isValidSubscriptionPlan,
  PUBLIC_MODEL_ID,
  SUPPORTED_PLANS,
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
      subscriptionPlan: "max20x",
    });
  });

  test("accepts valid model settings payloads", () => {
    expect(validateModelSettings(DEFAULT_MODEL_SETTINGS)).toEqual(DEFAULT_MODEL_SETTINGS);
    expect(
      validateModelSettings({
        selectedModel: "claude-sonnet-4-6",
        subscriptionPlan: "pro",
      }),
    ).toEqual({
      selectedModel: "claude-sonnet-4-6",
      subscriptionPlan: "pro",
    });
    expect(
      validateModelSettings({
        selectedModel: "claude-haiku-4-5",
        subscriptionPlan: "max5x",
      }),
    ).toEqual({
      selectedModel: "claude-haiku-4-5",
      subscriptionPlan: "max5x",
    });
  });

  test("falls back to default plan when subscriptionPlan is missing (legacy payloads)", () => {
    expect(
      validateModelSettings({
        selectedModel: "claude-opus-4-7",
      }),
    ).toEqual({
      selectedModel: "claude-opus-4-7",
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
