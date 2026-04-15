export type ThinkingEffort = "low" | "medium" | "high";

export type SupportedSelectedModel = "claude-opus-4-6" | "claude-sonnet-4-6" | "claude-haiku-4-5";

/**
 * Anthropic prompt cache TTL. "5m" is the default (free cache writes); "1h"
 * requires the extended-cache-ttl-2025-04-11 beta header and 2× write cost,
 * useful for async/batch workflows where the 5m default would expire.
 */
export type CacheTTL = "5m" | "1h";

export const CACHE_TTL_VALUES: readonly CacheTTL[] = ["5m", "1h"];

export interface ModelSettings {
  selectedModel: SupportedSelectedModel;
  thinkingEnabled: boolean;
  thinkingEffort: ThinkingEffort;
  cacheTTL: CacheTTL;
}

export const PUBLIC_MODEL_ID = "Claude Code" as const;

export const DEFAULT_MODEL_SETTINGS = {
  selectedModel: "claude-opus-4-6",
  thinkingEnabled: true,
  thinkingEffort: "high",
  cacheTTL: "5m",
} as const satisfies ModelSettings;

/** Padding added to thinking budget to compute max_tokens */
export const THINKING_MAX_TOKENS_PADDING = 8192;

const EXPOSED_MODEL_IDS = [PUBLIC_MODEL_ID] as const;

const THINKING_BUDGETS: Record<ThinkingEffort, number> = {
  low: 4096,
  medium: 8192,
  high: 16384,
};

export const SUPPORTED_SELECTED_MODELS: readonly SupportedSelectedModel[] = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];

export function getExposedModels(): string[] {
  return [...EXPOSED_MODEL_IDS];
}

export function isAllowedPublicModel(modelId: string): modelId is typeof PUBLIC_MODEL_ID {
  return modelId === PUBLIC_MODEL_ID;
}

export function getInvalidPublicModelMessage(modelId: string): string {
  return `Invalid model "${modelId}": only "${PUBLIC_MODEL_ID}" is supported.`;
}

export function getThinkingBudget(effort: ThinkingEffort): number {
  return THINKING_BUDGETS[effort];
}

/** Maps a user-facing selected model to the actual API model ID */
export function getApiModelId(model: SupportedSelectedModel): string {
  return model;
}

/** Returns the context window size for a given selected model */
export function getContextLength(model: SupportedSelectedModel): number {
  if (model === "claude-opus-4-6") return 1000000;
  return 200000;
}

export function validateModelSettings(input: unknown): ModelSettings {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid model settings payload");
  }

  const candidate = input as Partial<ModelSettings>;

  if (
    candidate.selectedModel === undefined ||
    !SUPPORTED_SELECTED_MODELS.includes(candidate.selectedModel)
  ) {
    throw new Error(`Unsupported selectedModel: ${String(candidate.selectedModel)}`);
  }

  if (typeof candidate.thinkingEnabled !== "boolean") {
    throw new Error("Invalid thinkingEnabled value");
  }

  if (
    candidate.thinkingEffort !== "low" &&
    candidate.thinkingEffort !== "medium" &&
    candidate.thinkingEffort !== "high"
  ) {
    throw new Error("Invalid thinkingEffort value");
  }

  if (candidate.cacheTTL === undefined || !CACHE_TTL_VALUES.includes(candidate.cacheTTL)) {
    throw new Error(`Invalid cacheTTL value: ${String(candidate.cacheTTL)}`);
  }

  return {
    selectedModel: candidate.selectedModel,
    thinkingEnabled: candidate.thinkingEnabled,
    thinkingEffort: candidate.thinkingEffort,
    cacheTTL: candidate.cacheTTL,
  };
}
