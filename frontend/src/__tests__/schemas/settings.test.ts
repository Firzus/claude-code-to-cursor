import { describe, expect, it } from "vitest";
import { settingsFormSchema } from "../../schemas/settings";

describe("settingsFormSchema", () => {
  it("accepts valid settings", () => {
    const result = settingsFormSchema.safeParse({
      selectedModel: "claude-opus-4-6",
      thinkingEnabled: true,
      thinkingEffort: "high",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all supported models", () => {
    for (const model of ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"]) {
      const result = settingsFormSchema.safeParse({
        selectedModel: model,
        thinkingEnabled: false,
        thinkingEffort: "low",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid model", () => {
    const result = settingsFormSchema.safeParse({
      selectedModel: "gpt-4",
      thinkingEnabled: true,
      thinkingEffort: "high",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid effort", () => {
    const result = settingsFormSchema.safeParse({
      selectedModel: "claude-opus-4-6",
      thinkingEnabled: true,
      thinkingEffort: "ultra",
    });
    expect(result.success).toBe(false);
  });

  it("requires all fields", () => {
    const result = settingsFormSchema.safeParse({
      selectedModel: "claude-opus-4-6",
    });
    expect(result.success).toBe(false);
  });
});
