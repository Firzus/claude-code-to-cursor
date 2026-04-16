import { describe, expect, test } from "bun:test";
import { getSuggestedMaxTokens, type ModelSettings } from "./model-settings";
import { applyThinkingToBody, minThinkingEffort, pickRoute } from "./routing-policy";
import type { AnthropicRequest } from "./types";

const BASE_SETTINGS: ModelSettings = {
  selectedModel: "claude-opus-4-7",
  thinkingEnabled: true,
  thinkingEffort: "high",
};

const BASE_BODY: AnthropicRequest = {
  model: "placeholder",
  max_tokens: 1024,
  messages: [{ role: "user", content: "hi" }],
};

describe("pickRoute", () => {
  test("thinkingEnabled=false → disabled, no effort", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEnabled: false },
      clientEffort: null,
    });
    expect(decision.policy).toBe("disabled");
    expect(decision.effort).toBeNull();
  });

  test("clientEffort='medium' overrides stored effort", () => {
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      clientEffort: "medium",
    });
    expect(decision.policy).toBe("client");
    expect(decision.effort).toBe("medium");
  });

  test("no clientEffort → stored effort", () => {
    const decision = pickRoute({
      settings: BASE_SETTINGS,
      clientEffort: null,
    });
    expect(decision.policy).toBe("stored");
    expect(decision.effort).toBe("high");
  });

  test("thinkingEnabled=false wins over clientEffort", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEnabled: false },
      clientEffort: "high",
    });
    expect(decision.policy).toBe("disabled");
    expect(decision.effort).toBeNull();
  });

  test("stored effort='low' is preserved", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEffort: "low" },
      clientEffort: null,
    });
    expect(decision.policy).toBe("stored");
    expect(decision.effort).toBe("low");
  });

  test("client high is capped to stored medium", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEffort: "medium" },
      clientEffort: "high",
    });
    expect(decision.policy).toBe("client");
    expect(decision.effort).toBe("medium");
  });

  test("client max is capped to stored xhigh", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEffort: "xhigh" },
      clientEffort: "max",
    });
    expect(decision.policy).toBe("client");
    expect(decision.effort).toBe("xhigh");
  });

  test("stored effort='max' passes through", () => {
    const decision = pickRoute({
      settings: { ...BASE_SETTINGS, thinkingEffort: "max" },
      clientEffort: null,
    });
    expect(decision.policy).toBe("stored");
    expect(decision.effort).toBe("max");
  });
});

describe("minThinkingEffort", () => {
  test("returns the lower effort", () => {
    expect(minThinkingEffort("high", "low")).toBe("low");
    expect(minThinkingEffort("low", "medium")).toBe("low");
    expect(minThinkingEffort("medium", "high")).toBe("medium");
    expect(minThinkingEffort("high", "high")).toBe("high");
  });

  test("handles xhigh and max in the ordering", () => {
    expect(minThinkingEffort("xhigh", "high")).toBe("high");
    expect(minThinkingEffort("max", "xhigh")).toBe("xhigh");
    expect(minThinkingEffort("max", "low")).toBe("low");
    expect(minThinkingEffort("xhigh", "xhigh")).toBe("xhigh");
    expect(minThinkingEffort("max", "max")).toBe("max");
  });
});

describe("applyThinkingToBody", () => {
  test("emits adaptive thinking + output_config when effort is set", () => {
    const body = applyThinkingToBody(
      BASE_BODY,
      { effort: "xhigh", policy: "stored" },
      undefined,
      0.7,
      "claude-opus-4-7",
    );
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({ effort: "xhigh" });
    expect(body.temperature).toBe(1);
    expect(body.model).toBe("claude-opus-4-7");
    expect(body.max_tokens).toBe(getSuggestedMaxTokens("xhigh"));
  });

  test("respects client max_tokens when larger than suggested", () => {
    const body = applyThinkingToBody(
      BASE_BODY,
      { effort: "medium", policy: "client" },
      999999,
      undefined,
      "claude-opus-4-7",
    );
    expect(body.max_tokens).toBe(999999);
  });

  test("removes thinking and output_config when effort is null", () => {
    const body = applyThinkingToBody(
      { ...BASE_BODY, thinking: { type: "adaptive" }, output_config: { effort: "high" } },
      { effort: null, policy: "disabled" },
      512,
      0.5,
      "claude-opus-4-7",
    );
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toBeUndefined();
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(512);
  });

  test.each(["low", "medium", "high", "xhigh", "max"] as const)(
    "sets output_config.effort=%s",
    (effort) => {
      const body = applyThinkingToBody(
        BASE_BODY,
        { effort, policy: "stored" },
        undefined,
        undefined,
        "claude-opus-4-7",
      );
      expect(body.output_config?.effort).toBe(effort);
    },
  );
});
