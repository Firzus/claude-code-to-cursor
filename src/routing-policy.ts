/**
 * Routing policy — decides the thinking effort for each proxied request.
 *
 * The model itself is always `settings.selectedModel`; routing only picks the
 * thinking budget based on user settings and any client-provided override.
 *
 * Pure module: no I/O, no logger dependency → easy to unit-test.
 */

import {
  getThinkingBudget,
  type ModelSettings,
  THINKING_MAX_TOKENS_PADDING,
  type ThinkingEffort,
} from "./model-settings";
import type { AnthropicRequest } from "./types";

export type RoutingPolicyLabel = "disabled" | "client" | "stored";

export interface RoutingDecision {
  /** null = thinking disabled for this request */
  effort: ThinkingEffort | null;
  /** How the decision was reached */
  policy: RoutingPolicyLabel;
  /** Pre-resolved token budget (null when effort is null) */
  budgetTokens: number | null;
}

/**
 * Decide thinking effort:
 *   !thinkingEnabled         → null,         "disabled"
 *   clientEffort !== null    → clientEffort, "client"
 *   otherwise                → storedEffort, "stored"
 */
export function pickRoute(args: {
  settings: ModelSettings;
  clientEffort: ThinkingEffort | null;
}): RoutingDecision {
  const { settings, clientEffort } = args;

  if (!settings.thinkingEnabled) {
    return { effort: null, policy: "disabled", budgetTokens: null };
  }

  if (clientEffort !== null) {
    return {
      effort: clientEffort,
      policy: "client",
      budgetTokens: getThinkingBudget(clientEffort),
    };
  }

  return {
    effort: settings.thinkingEffort,
    policy: "stored",
    budgetTokens: getThinkingBudget(settings.thinkingEffort),
  };
}

/**
 * Apply a RoutingDecision to an AnthropicRequest body.
 *
 * Centralises:
 * - Setting `model` to the resolved API model ID
 * - Setting `thinking` block (or removing it)
 * - Forcing `temperature=1` when thinking is enabled
 * - Ensuring `max_tokens` is large enough to hold the thinking budget + output
 */
export function applyThinkingToBody(
  body: AnthropicRequest,
  decision: RoutingDecision,
  baseMaxTokens: number | undefined,
  clientTemperature: number | undefined,
  apiModelId: string,
): AnthropicRequest {
  const result: AnthropicRequest = {
    ...body,
    model: apiModelId,
  };

  if (decision.effort === null || decision.budgetTokens === null) {
    // Thinking disabled: restore client temperature, drop thinking block
    result.temperature = clientTemperature;
    result.max_tokens = baseMaxTokens ?? 4096;
    delete result.thinking;
  } else {
    const minTokens = decision.budgetTokens + THINKING_MAX_TOKENS_PADDING;
    result.temperature = 1;
    result.max_tokens = Math.max(baseMaxTokens ?? 0, minTokens);
    result.thinking = { type: "enabled", budget_tokens: decision.budgetTokens };
  }

  return result;
}
