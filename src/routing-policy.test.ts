import { describe, expect, test } from "bun:test";
import type { ModelSettings } from "./model-settings";
import { getThinkingBudget } from "./model-settings";
import { pickRoute } from "./routing-policy";

const BASE_SETTINGS: ModelSettings = {
  selectedModel: "claude-opus-4-6",
  thinkingEnabled: true,
  thinkingEffort: "high",
  adaptiveRouting: true,
  continuationModel: "claude-sonnet-4-6",
};

const FRESH_SHAPE = {
  lastMsgHasToolResult: false,
  toolUseCount: 0,
  toolResultCount: 0,
};

const CONTINUATION_SHAPE = {
  lastMsgHasToolResult: true,
  toolUseCount: 3,
  toolResultCount: 3,
};

describe("pickRoute", () => {
  test("1. thinkingEnabled=false → disabled, no effort, default model", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEnabled: false },
      shape: FRESH_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("disabled");
    expect(decision.effort).toBeNull();
    expect(decision.budgetTokens).toBeNull();
    expect(decision.model).toBe("claude-opus-4-6");
  });

  test("2. clientEffort='medium' → client policy, default model, ignores shape", () => {
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      shape: CONTINUATION_SHAPE,
      clientEffort: "medium",
    });
    expect(decision.policy).toBe("client");
    expect(decision.effort).toBe("medium");
    expect(decision.budgetTokens).toBe(getThinkingBudget("medium"));
    expect(decision.model).toBe("claude-opus-4-6"); // client wins but keeps defaultModel
  });

  test("3. adaptiveRouting=false, fresh shape → adaptive-off, stored effort, default model", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, adaptiveRouting: false },
      shape: FRESH_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("adaptive-off");
    expect(decision.effort).toBe("high");
    expect(decision.budgetTokens).toBe(getThinkingBudget("high"));
    expect(decision.model).toBe("claude-opus-4-6");
  });

  test("4. adaptiveRouting=false, continuation shape → adaptive-off (no downgrade)", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, adaptiveRouting: false },
      shape: CONTINUATION_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("adaptive-off");
    expect(decision.effort).toBe("high");
    expect(decision.model).toBe("claude-opus-4-6");
  });

  test("5. adaptiveRouting=true, continuation (toolUseCount=3) → continuation, low, continuationModel", () => {
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      shape: CONTINUATION_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("continuation");
    expect(decision.effort).toBe("low");
    expect(decision.budgetTokens).toBe(getThinkingBudget("low"));
    expect(decision.model).toBe("claude-sonnet-4-6");
  });

  test("6. adaptiveRouting=true, lastMsgHasToolResult=true but toolUseCount=0 → fresh (defensive guard)", () => {
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      shape: { lastMsgHasToolResult: true, toolUseCount: 0, toolResultCount: 1 },
      clientEffort: null,
    });
    expect(decision.policy).toBe("fresh");
    expect(decision.model).toBe("claude-opus-4-6");
  });

  test("7. adaptiveRouting=true, fresh shape → fresh, stored effort, default model", () => {
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      shape: FRESH_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("fresh");
    expect(decision.effort).toBe("high");
    expect(decision.budgetTokens).toBe(getThinkingBudget("high"));
    expect(decision.model).toBe("claude-opus-4-6");
  });

  test("8. thinkingEffort='low' + continuation → continuation policy (label correct, effort=low)", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEffort: "low" },
      shape: CONTINUATION_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("continuation");
    expect(decision.effort).toBe("low");
    expect(decision.model).toBe("claude-sonnet-4-6");
  });

  test("9. clientEffort='low' + continuation shape → client policy, default model (client wins)", () => {
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      shape: CONTINUATION_SHAPE,
      clientEffort: "low",
    });
    expect(decision.policy).toBe("client");
    expect(decision.effort).toBe("low");
    expect(decision.model).toBe("claude-opus-4-6"); // client wins → keep defaultModel
  });

  test("10. continuationModel=haiku + continuation → model is haiku, effort is low", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, continuationModel: "claude-haiku-4-5" },
      shape: CONTINUATION_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("continuation");
    expect(decision.model).toBe("claude-haiku-4-5");
    expect(decision.effort).toBe("low");
  });
});
