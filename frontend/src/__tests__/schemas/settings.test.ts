import { describe, expect, it } from "vitest";
import { settingsFormSchema } from "../../schemas/settings";

describe("settingsFormSchema", () => {
  it("accepts valid settings", () => {
    const result = settingsFormSchema.safeParse({
      selectedModel: "claude-opus-4-7",
      subscriptionPlan: "max20x",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all supported models", () => {
    for (const model of ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"]) {
      const result = settingsFormSchema.safeParse({
        selectedModel: model,
        subscriptionPlan: "pro",
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all 3 subscription plans", () => {
    for (const plan of ["pro", "max5x", "max20x"]) {
      const result = settingsFormSchema.safeParse({
        selectedModel: "claude-opus-4-7",
        subscriptionPlan: plan,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid subscription plan", () => {
    const result = settingsFormSchema.safeParse({
      selectedModel: "claude-opus-4-7",
      subscriptionPlan: "enterprise",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid model", () => {
    const result = settingsFormSchema.safeParse({
      selectedModel: "gpt-4",
      subscriptionPlan: "max20x",
    });
    expect(result.success).toBe(false);
  });

  it("requires all fields", () => {
    const result = settingsFormSchema.safeParse({
      selectedModel: "claude-opus-4-7",
    });
    expect(result.success).toBe(false);
  });
});
