import { describe, expect, test } from "bun:test";
import type { ModelSettings } from "./model-settings";
import { getThinkingBudget } from "./model-settings";
import { adaptiveThinkingEffort, minThinkingEffort, pickRoute } from "./routing-policy";
import type { RequestShapeMetrics } from "./types";

const BASE_SETTINGS: ModelSettings = {
  selectedModel: "claude-opus-4-6",
  thinkingEnabled: true,
  thinkingEffort: "high",
  cacheTTL: "5m",
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

  test("tool result follow-up reduces high cap to low (adaptive)", () => {
    const shape: RequestShapeMetrics = {
      route: "openai",
      messageCount: 8,
      lastMsgRole: "user",
      lastMsgHasToolResult: true,
      toolUseCount: 1,
      toolResultCount: 1,
      toolDefsCount: 5,
      toolDefsHash: "abc",
      clientSystemHash: null,
      clientReasoningEffort: null,
    };
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      clientEffort: null,
      shape,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.effort).toBe("low");
    expect(decision.budgetTokens).toBe(getThinkingBudget("low"));
  });

  test("long thread reduces high to medium (adaptive)", () => {
    const shape: RequestShapeMetrics = {
      route: "openai",
      messageCount: 12,
      lastMsgRole: "user",
      lastMsgHasToolResult: false,
      toolUseCount: 0,
      toolResultCount: 0,
      toolDefsCount: 0,
      toolDefsHash: null,
      clientSystemHash: null,
      clientReasoningEffort: null,
    };
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      clientEffort: null,
      shape,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.effort).toBe("medium");
  });

  test("many tool results (>3) reduces to low (adaptive)", () => {
    const shape: RequestShapeMetrics = {
      route: "openai",
      messageCount: 8,
      lastMsgRole: "user",
      lastMsgHasToolResult: false,
      toolUseCount: 4,
      toolResultCount: 4,
      toolDefsCount: 5,
      toolDefsHash: "abc",
      clientSystemHash: null,
      clientReasoningEffort: null,
    };
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      clientEffort: null,
      shape,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.effort).toBe("low");
  });

  test("very long thread (>20) forces low (adaptive)", () => {
    const shape: RequestShapeMetrics = {
      route: "openai",
      messageCount: 22,
      lastMsgRole: "user",
      lastMsgHasToolResult: false,
      toolUseCount: 0,
      toolResultCount: 0,
      toolDefsCount: 0,
      toolDefsHash: null,
      clientSystemHash: null,
      clientReasoningEffort: null,
    };
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      clientEffort: null,
      shape,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.effort).toBe("low");
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

describe("adaptiveThinkingEffort", () => {
  test("undefined shape returns cap", () => {
    expect(adaptiveThinkingEffort(undefined, "high")).toBe("high");
  });

  test("minThinkingEffort", () => {
    expect(minThinkingEffort("high", "low")).toBe("low");
    expect(minThinkingEffort("low", "medium")).toBe("low");
  });
});
