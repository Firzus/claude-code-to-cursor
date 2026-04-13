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

  test("2. clientEffort='medium' + continuation → client effort, but model still adapted (decoupled)", () => {
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      shape: CONTINUATION_SHAPE,
      clientEffort: "medium",
    });
    expect(decision.policy).toBe("client");
    expect(decision.effort).toBe("medium");
    expect(decision.budgetTokens).toBe(getThinkingBudget("medium"));
    expect(decision.model).toBe("claude-sonnet-4-6"); // model adapted to continuation
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

  test("5. adaptiveRouting=true, continuation (toolUseCount=3) → continuation, NO thinking, continuationModel", () => {
    // Floor lowered from "low" to null after telemetry showed 0 thinking usage
    // on 40+ Haiku continuation requests.
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      shape: CONTINUATION_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("continuation");
    expect(decision.effort).toBeNull();
    expect(decision.budgetTokens).toBeNull();
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

  test("8. thinkingEffort='low' + continuation → continuation (effort still null, stored effort ignored)", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEffort: "low" },
      shape: CONTINUATION_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("continuation");
    expect(decision.effort).toBeNull();
    expect(decision.model).toBe("claude-sonnet-4-6");
  });

  test("9. clientEffort='low' + continuation shape → client policy, continuation model (decoupled)", () => {
    // Model routing and effort routing are orthogonal: client effort wins for
    // the budget, but model adaptation still applies based on the request shape.
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      shape: CONTINUATION_SHAPE,
      clientEffort: "low",
    });
    expect(decision.policy).toBe("client");
    expect(decision.effort).toBe("low");
    expect(decision.model).toBe("claude-sonnet-4-6"); // model still adapted
  });

  test("10. continuationModel=haiku + continuation → model is haiku, no thinking", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, continuationModel: "claude-haiku-4-5" },
      shape: CONTINUATION_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("continuation");
    expect(decision.model).toBe("claude-haiku-4-5");
    expect(decision.effort).toBeNull();
  });

  test("11. thinkingEnabled=false + continuation → disabled-continuation, continuation model, no effort", () => {
    // Regression test for the gap observed post-deploy: when thinking is off,
    // model routing must STILL apply on continuations.
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEnabled: false },
      shape: CONTINUATION_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("disabled-continuation");
    expect(decision.model).toBe("claude-sonnet-4-6");
    expect(decision.effort).toBeNull();
    expect(decision.budgetTokens).toBeNull();
  });

  test("12. thinkingEnabled=false + adaptiveRouting=false + continuation → disabled, default model", () => {
    // The adaptive toggle still gates model adaptation when thinking is off.
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEnabled: false, adaptiveRouting: false },
      shape: CONTINUATION_SHAPE,
      clientEffort: null,
    });
    expect(decision.policy).toBe("disabled");
    expect(decision.model).toBe("claude-opus-4-6");
    expect(decision.effort).toBeNull();
  });
});
