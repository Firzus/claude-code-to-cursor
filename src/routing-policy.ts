/**
 * Adaptive routing policy — decides both the API model and thinking effort
 * for each proxied request based on its shape.
 *
 * Pure module: no I/O, no logger dependency → easy to unit-test.
 */

import {
  getApiModelId,
  getThinkingBudget,
  type ModelSettings,
  type SupportedSelectedModel,
  THINKING_MAX_TOKENS_PADDING,
  type ThinkingEffort,
} from "./model-settings";
import type { RequestShapeMetrics } from "./db";
import type { AnthropicRequest } from "./types";

export type RoutingPolicyLabel =
  | "disabled"
  | "client"
  | "fresh"
  | "continuation"
  | "adaptive-off";

export interface RoutingDecision {
  /** The actual model to use for this request */
  model: SupportedSelectedModel;
  /** null = thinking disabled for this request */
  effort: ThinkingEffort | null;
  /** How the decision was reached */
  policy: RoutingPolicyLabel;
  /** Pre-resolved token budget (null when effort is null) */
  budgetTokens: number | null;
}

/**
 * Decision tree (evaluated in order):
 *
 * 1. thinkingEnabled=false        → { defaultModel, null,              "disabled"     }
 * 2. clientEffort !== null         → { defaultModel, client,            "client"       }
 * 3. adaptiveRouting=false         → { defaultModel, storedEffort,      "adaptive-off" }
 * 4. continuation turn             → { continuationModel, "low",        "continuation" }
 * 5. otherwise                     → { defaultModel, storedEffort,      "fresh"        }
 *
 * "Continuation turn" = last message has a tool_result block AND there is at
 * least one tool_use block in the conversation (defensive guard against
 * synthetic first-turn tool_result injection).
 */
export function pickRoute(args: {
  settings: ModelSettings;
  shape: Pick<RequestShapeMetrics, "lastMsgHasToolResult" | "toolUseCount" | "toolResultCount">;
  clientEffort: ThinkingEffort | null;
}): RoutingDecision {
  const { settings, shape, clientEffort } = args;
  const defaultModel = settings.selectedModel;
  const storedEffort = settings.thinkingEffort;

  // 1. Thinking globally disabled
  if (!settings.thinkingEnabled) {
    return { model: defaultModel, effort: null, policy: "disabled", budgetTokens: null };
  }

  // 2. Client explicitly requested an effort level → honour it
  if (clientEffort !== null) {
    return {
      model: defaultModel,
      effort: clientEffort,
      policy: "client",
      budgetTokens: getThinkingBudget(clientEffort),
    };
  }

  // 3. Adaptive routing disabled → always use default model + stored effort
  if (!settings.adaptiveRouting) {
    return {
      model: defaultModel,
      effort: storedEffort,
      policy: "adaptive-off",
      budgetTokens: getThinkingBudget(storedEffort),
    };
  }

  // 4. Continuation turn: last message is a tool_result and there are prior tool_use blocks
  if (shape.lastMsgHasToolResult && shape.toolUseCount > 0) {
    return {
      model: settings.continuationModel,
      effort: "low",
      policy: "continuation",
      budgetTokens: getThinkingBudget("low"),
    };
  }

  // 5. Fresh turn
  return {
    model: defaultModel,
    effort: storedEffort,
    policy: "fresh",
    budgetTokens: getThinkingBudget(storedEffort),
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
): AnthropicRequest {
  const result: AnthropicRequest = {
    ...body,
    model: getApiModelId(decision.model),
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
