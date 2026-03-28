export type ThinkingEffort = "low" | "medium" | "high";

export type SupportedSelectedModel =
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5";

export interface ModelSettings {
  selectedModel: SupportedSelectedModel;
  thinkingEnabled: boolean;
  thinkingEffort: ThinkingEffort;
}

export const PUBLIC_MODEL_ID = "Claude Code" as const;

export const DEFAULT_MODEL_SETTINGS = {
  selectedModel: "claude-opus-4-6",
  thinkingEnabled: true,
  thinkingEffort: "high",
} as const satisfies ModelSettings;

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

export function validateModelSettings(input: unknown): ModelSettings {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid model settings payload");
  }

  const candidate = input as Partial<ModelSettings>;

  if (candidate.selectedModel === undefined || !SUPPORTED_SELECTED_MODELS.includes(candidate.selectedModel)) {
    throw new Error(`Unsupported selectedModel: ${String(candidate.selectedModel)}`);
  }

  if (typeof candidate.thinkingEnabled !== "boolean") {
    throw new Error("Invalid thinkingEnabled value");
  }

  if (candidate.thinkingEffort !== "low" && candidate.thinkingEffort !== "medium" && candidate.thinkingEffort !== "high") {
    throw new Error("Invalid thinkingEffort value");
  }

  return {
    selectedModel: candidate.selectedModel,
    thinkingEnabled: candidate.thinkingEnabled,
    thinkingEffort: candidate.thinkingEffort,
  };
}
