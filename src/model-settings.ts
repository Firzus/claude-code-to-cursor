export const VALID_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingEffort = (typeof VALID_EFFORTS)[number];

export type SupportedSelectedModel =
  | "claude-opus-4-7"
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5";

export const SUPPORTED_PLANS = ["pro", "max5x", "max20x"] as const;
export type SubscriptionPlan = (typeof SUPPORTED_PLANS)[number];

export interface ModelSettings {
  selectedModel: SupportedSelectedModel;
  thinkingEnabled: boolean;
  thinkingEffort: ThinkingEffort;
  subscriptionPlan: SubscriptionPlan;
}

export const PUBLIC_MODEL_ID = "claude-code" as const;

export const DEFAULT_MODEL_SETTINGS = {
  selectedModel: "claude-opus-4-7",
  thinkingEnabled: true,
  thinkingEffort: "high",
  subscriptionPlan: "max20x",
} as const satisfies ModelSettings;

/**
 * Approximate public token quotas per Claude subscription plan.
 *
 * Sources (as of April 2026): community reports and Anthropic's public help
 * center. These numbers are heuristics — Anthropic does not publish a firm
 * public token quota for consumer plans, and the real limits are controlled by
 * internal policy. Weekly values are conservative estimates.
 */
export interface PlanQuotas {
  fiveHourTokens: number;
  weeklyTokens: number;
}

const PLAN_QUOTAS: Record<SubscriptionPlan, PlanQuotas> = {
  pro: { fiveHourTokens: 44_000, weeklyTokens: 1_500_000 },
  max5x: { fiveHourTokens: 88_000, weeklyTokens: 7_500_000 },
  max20x: { fiveHourTokens: 220_000, weeklyTokens: 30_000_000 },
};

export function getPlanQuotas(plan: SubscriptionPlan): PlanQuotas {
  return PLAN_QUOTAS[plan];
}

export function isValidSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return typeof value === "string" && (SUPPORTED_PLANS as readonly string[]).includes(value);
}

const EXPOSED_MODEL_IDS = [PUBLIC_MODEL_ID] as const;

/**
 * Suggested `max_tokens` per effort level.
 *
 * Anthropic's docs state that "effort is a behavioral signal, not a strict
 * token budget" - the real depth of reasoning is chosen adaptively by the
 * model. These values are used only to guarantee a reasonable default
 * `max_tokens` when the client doesn't provide one, so that the model has
 * enough headroom to think + answer at the given effort level.
 *
 * For Opus 4.7, the docs recommend a `max_tokens` of ~64k when running at
 * `xhigh` or `max`.
 */
const SUGGESTED_MAX_TOKENS: Record<ThinkingEffort, number> = {
  low: 8192,
  medium: 16384,
  high: 32768,
  xhigh: 65536,
  max: 65536,
};

export const SUPPORTED_SELECTED_MODELS: readonly SupportedSelectedModel[] = [
  "claude-opus-4-7",
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

export function getSuggestedMaxTokens(effort: ThinkingEffort): number {
  return SUGGESTED_MAX_TOKENS[effort];
}

export function isValidThinkingEffort(value: unknown): value is ThinkingEffort {
  return typeof value === "string" && (VALID_EFFORTS as readonly string[]).includes(value);
}

/** Maps a user-facing selected model to the actual API model ID */
export function getApiModelId(model: SupportedSelectedModel): string {
  return model;
}

/** Returns the context window size for a given selected model */
export function getContextLength(model: SupportedSelectedModel): number {
  if (model === "claude-opus-4-7" || model === "claude-opus-4-6") return 1000000;
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

  if (!isValidThinkingEffort(candidate.thinkingEffort)) {
    throw new Error("Invalid thinkingEffort value");
  }

  // Accept legacy payloads that predate the subscriptionPlan field by
  // falling back to the default plan when the field is missing.
  const subscriptionPlan: SubscriptionPlan =
    candidate.subscriptionPlan === undefined
      ? DEFAULT_MODEL_SETTINGS.subscriptionPlan
      : isValidSubscriptionPlan(candidate.subscriptionPlan)
        ? candidate.subscriptionPlan
        : (() => {
            throw new Error(`Unsupported subscriptionPlan: ${String(candidate.subscriptionPlan)}`);
          })();

  return {
    selectedModel: candidate.selectedModel,
    thinkingEnabled: candidate.thinkingEnabled,
    thinkingEffort: candidate.thinkingEffort,
    subscriptionPlan,
  };
}
