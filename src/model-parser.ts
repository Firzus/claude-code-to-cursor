import {
  getExposedModels as getPublicModelIds,
  getThinkingBudget,
  isAllowedPublicModel,
  PUBLIC_MODEL_ID,
  type ThinkingEffort,
} from "./model-settings";

export interface ParsedModel {
  publicModelId: typeof PUBLIC_MODEL_ID;
}

/**
 * Parses the single public model ID exposed by ccproxy.
 */
export function parseModelId(modelId: string): ParsedModel | null {
  if (!isAllowedPublicModel(modelId)) return null;
  return { publicModelId: modelId };
}

export function getBudgetTokens(effort: ThinkingEffort): number {
  return getThinkingBudget(effort);
}

/** All model entries for the /v1/models response */
export function getExposedModels() {
  return getPublicModelIds().map((id) => ({
    id,
    context_length: 1000000,
    max_output_tokens: 128000,
    object: "model",
    created: 1700000000,
    owned_by: "anthropic",
  }));
}
