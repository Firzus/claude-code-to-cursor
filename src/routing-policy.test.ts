import { describe, expect, test } from "bun:test";
import type { ModelSettings } from "./model-settings";
import { getThinkingBudget } from "./model-settings";
import { minThinkingEffort, pickRoute } from "./routing-policy";

const BASE_SETTINGS: ModelSettings = {
  selectedModel: "claude-opus-4-7",
  thinkingEnabled: true,
  thinkingEffort: "high",
};

describe("pickRoute", () => {
  test("thinkingEnabled=false → disabled, no effort", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEnabled: false },
      clientEffort: null,
    });
    expect(decision.policy).toBe("disabled");
    expect(decision.effort).toBeNull();
    expect(decision.budgetTokens).toBeNull();
  });

  test("clientEffort='medium' overrides stored effort", () => {
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      clientEffort: "medium",
    });
    expect(decision.policy).toBe("client");
    expect(decision.effort).toBe("medium");
    expect(decision.budgetTokens).toBe(getThinkingBudget("medium"));
  });

  test("no clientEffort → stored effort", () => {
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      clientEffort: null,
    });
    expect(decision.policy).toBe("stored");
    expect(decision.effort).toBe("high");
    expect(decision.budgetTokens).toBe(getThinkingBudget("high"));
  });

  test("thinkingEnabled=false wins over clientEffort", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEnabled: false },
      clientEffort: "high",
    });
    expect(decision.policy).toBe("disabled");
    expect(decision.effort).toBeNull();
    expect(decision.budgetTokens).toBeNull();
  });

  test("stored effort='low' maps to low budget", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEffort: "low" },
      clientEffort: null,
    });
    expect(decision.policy).toBe("stored");
    expect(decision.effort).toBe("low");
    expect(decision.budgetTokens).toBe(getThinkingBudget("low"));
  });

  test("client high is capped to stored medium", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEffort: "medium" },
      clientEffort: "high",
    });
    expect(decision.policy).toBe("client");
    expect(decision.effort).toBe("medium");
    expect(decision.budgetTokens).toBe(getThinkingBudget("medium"));
  });
});

describe("minThinkingEffort", () => {
  test("returns the lower effort", () => {
    expect(minThinkingEffort("high", "low")).toBe("low");
    expect(minThinkingEffort("low", "medium")).toBe("low");
    expect(minThinkingEffort("medium", "high")).toBe("medium");
    expect(minThinkingEffort("high", "high")).toBe("high");
  });
});
