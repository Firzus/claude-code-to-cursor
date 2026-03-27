export type ThinkingEffort = "low" | "medium" | "high";

export const THINKING_BUDGET_MAP: Record<ThinkingEffort, number> = {
  low: 4096,
  medium: 8192,
  high: 16384,
};

// Base Anthropic models exposed to clients
const ANTHROPIC_BASE_MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];

// Legacy alias → real Anthropic model
const MODEL_ALIASES: Record<string, string> = {
  "Claude Code": "claude-sonnet-4-6",
};

export interface ParsedModel {
  baseModel: string;
  thinkingEffort: ThinkingEffort | null;
}

/**
 * Parses a model ID into base model + thinking effort.
 * Handles legacy aliases (e.g. "Claude Code") and thinking suffixes (e.g. "-high-thinking").
 * Returns null for unknown/unsupported models — callers should reject those requests.
 */
export function parseModelId(modelId: string): ParsedModel | null {
  const aliased = MODEL_ALIASES[modelId];
  if (aliased) {
    return { baseModel: aliased, thinkingEffort: null };
  }

  if (!modelId.startsWith("claude-")) return null;

  for (const effort of ["high", "medium", "low"] as ThinkingEffort[]) {
    const suffix = `-${effort}-thinking`;
    if (modelId.endsWith(suffix)) {
      return { baseModel: modelId.slice(0, -suffix.length), thinkingEffort: effort };
    }
  }

  return { baseModel: modelId, thinkingEffort: null };
}

export function getBudgetTokens(effort: ThinkingEffort): number {
  return THINKING_BUDGET_MAP[effort];
}

/** All model entries for the /v1/models response */
export function getExposedModels() {
  const entries: { id: string; context_length: number; max_output_tokens: number }[] = [
    // Legacy alias — backward compat
    { id: "Claude Code", context_length: 200000, max_output_tokens: 128000 },
  ];

  for (const base of ANTHROPIC_BASE_MODELS) {
    entries.push({ id: base, context_length: 200000, max_output_tokens: 128000 });
    for (const effort of ["low", "medium", "high"]) {
      entries.push({ id: `${base}-${effort}-thinking`, context_length: 200000, max_output_tokens: 128000 });
    }
  }

  return entries.map((m) => ({
    ...m,
    object: "model",
    created: 1700000000,
    owned_by: "anthropic",
  }));
}
