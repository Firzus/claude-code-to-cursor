export type SupportedSelectedModel = "claude-opus-4-7" | "claude-sonnet-4-6" | "claude-haiku-4-5";

export const SUPPORTED_PLANS = ["pro", "max5x", "max20x"] as const;
export type SubscriptionPlan = (typeof SUPPORTED_PLANS)[number];

export interface ModelSettings {
  selectedModel: SupportedSelectedModel;
  subscriptionPlan: SubscriptionPlan;
}

export const PUBLIC_MODEL_ID = "Claude Code" as const;

export const DEFAULT_MODEL_SETTINGS = {
  selectedModel: "claude-opus-4-7",
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

export const SUPPORTED_SELECTED_MODELS: readonly SupportedSelectedModel[] = [
  "claude-opus-4-7",
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

/** Maps a user-facing selected model to the actual API model ID */
export function getApiModelId(model: SupportedSelectedModel): string {
  return model;
}

/** Returns the context window size for a given selected model */
export function getContextLength(model: SupportedSelectedModel): number {
  if (model === "claude-opus-4-7") return 1000000;
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
    subscriptionPlan,
  };
}
