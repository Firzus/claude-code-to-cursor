/**
 * Routing policy — decides the thinking effort for each proxied request.
 *
 * The model itself is always `settings.selectedModel`; routing only picks the
 * thinking effort based on user settings and any client-provided override.
 *
 * Pure module: no I/O, no logger dependency → easy to unit-test.
 */

import {
  getSuggestedMaxTokens,
  type ModelSettings,
  type ThinkingEffort,
  VALID_EFFORTS,
} from "./model-settings";
import type { AnthropicRequest } from "./types";

export type RoutingPolicyLabel = "disabled" | "client" | "stored";

function thinkingEffortRank(e: ThinkingEffort): number {
  return VALID_EFFORTS.indexOf(e);
}

/** Lexicographic min: low < medium < high < xhigh < max */
export function minThinkingEffort(a: ThinkingEffort, b: ThinkingEffort): ThinkingEffort {
  return thinkingEffortRank(a) <= thinkingEffortRank(b) ? a : b;
}

export interface RoutingDecision {
  /** null = thinking disabled for this request */
  effort: ThinkingEffort | null;
  /** How the decision was reached */
  policy: RoutingPolicyLabel;
}

/**
 * Decide thinking effort:
 *   !thinkingEnabled         → null,         "disabled"
 *   clientEffort !== null    → min(client, cap), "client"
 *   otherwise                → stored effort, "stored"
 */
export function pickRoute(args: {
  settings: ModelSettings;
  clientEffort: ThinkingEffort | null;
}): RoutingDecision {
  const { settings, clientEffort } = args;
  const cap = settings.thinkingEffort;

  if (!settings.thinkingEnabled) {
    return { effort: null, policy: "disabled" };
  }

  if (clientEffort !== null) {
    return { effort: minThinkingEffort(clientEffort, cap), policy: "client" };
  }

  return { effort: cap, policy: "stored" };
}

/**
 * Apply a RoutingDecision to an AnthropicRequest body.
 *
 * Centralises:
 * - Setting `model` to the resolved API model ID
 * - Setting `thinking: {type: "adaptive"}` + `output_config.effort` (or removing them)
 * - Forcing `temperature=1` when thinking is enabled
 * - Ensuring `max_tokens` is at least the suggested value for the effort level
 *
 * Anthropic's effort parameter is a behavioural signal — the model itself
 * decides how much to reason via adaptive thinking. We only guarantee a
 * reasonable `max_tokens` so the model has headroom to think + answer.
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

  if (decision.effort === null) {
    result.temperature = clientTemperature;
    result.max_tokens = baseMaxTokens ?? 4096;
    delete result.thinking;
    delete result.output_config;
  } else {
    const suggested = getSuggestedMaxTokens(decision.effort);
    result.temperature = 1;
    result.max_tokens = Math.max(baseMaxTokens ?? 0, suggested);
    result.thinking = { type: "adaptive" };
    result.output_config = { effort: decision.effort };
  }

  return result;
}
