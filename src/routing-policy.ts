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
  | "disabled-continuation"
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
 * Two-step decision (model and effort are orthogonal concerns):
 *
 * Step 1 — Model:
 *   adaptiveRouting && isContinuation → continuationModel
 *   else                              → defaultModel
 *
 * Step 2 — Effort + policy label:
 *   !thinkingEnabled                  → null,         "disabled" | "disabled-continuation"
 *   clientEffort !== null             → client,       "client"
 *   !adaptiveRouting                  → storedEffort, "adaptive-off"
 *   isContinuation                    → null,         "continuation"
 *   otherwise                         → storedEffort, "fresh"
 *
 * "Continuation turn" = last message has a tool_result block AND there is at
 * least one tool_use block in the conversation (defensive guard against
 * synthetic first-turn tool_result injection).
 *
 * Note: model adaptation is independent of thinking. A continuation turn with
 * thinking disabled still routes to `continuationModel` — labelled
 * `disabled-continuation` for telemetry.
 */
export function pickRoute(args: {
  settings: ModelSettings;
  shape: Pick<RequestShapeMetrics, "lastMsgHasToolResult" | "toolUseCount" | "toolResultCount">;
  clientEffort: ThinkingEffort | null;
}): RoutingDecision {
  const { settings, shape, clientEffort } = args;
  const defaultModel = settings.selectedModel;
  const storedEffort = settings.thinkingEffort;

  const isContinuation = shape.lastMsgHasToolResult && shape.toolUseCount > 0;

  // Step 1: pick the model (orthogonal to thinking and clientEffort)
  const model =
    settings.adaptiveRouting && isContinuation ? settings.continuationModel : defaultModel;

  // Step 2: pick the effort and policy label
  if (!settings.thinkingEnabled) {
    return {
      model,
      effort: null,
      policy: isContinuation && settings.adaptiveRouting ? "disabled-continuation" : "disabled",
      budgetTokens: null,
    };
  }

  if (clientEffort !== null) {
    return {
      model,
      effort: clientEffort,
      policy: "client",
      budgetTokens: getThinkingBudget(clientEffort),
    };
  }

  if (!settings.adaptiveRouting) {
    return {
      model,
      effort: storedEffort,
      policy: "adaptive-off",
      budgetTokens: getThinkingBudget(storedEffort),
    };
  }

  if (isContinuation) {
    // Continuations get NO thinking budget: telemetry shows Haiku never uses
    // thinking on mechanical tool-loop turns (0/40+ observations post-deploy).
    return {
      model,
      effort: null,
      policy: "continuation",
      budgetTokens: null,
    };
  }

  return {
    model,
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
