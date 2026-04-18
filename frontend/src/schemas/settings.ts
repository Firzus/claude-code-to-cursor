import { z } from "zod";

export const supportedModels = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const;

export const modelLabels: Record<(typeof supportedModels)[number], string> = {
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-haiku-4-5": "Claude Haiku 4.5",
};

export const thinkingEfforts = ["low", "medium", "high", "xhigh", "max"] as const;

export const supportedPlans = ["pro", "max5x", "max20x"] as const;

export const planLabels: Record<(typeof supportedPlans)[number], string> = {
  pro: "Pro",
  max5x: "Max (5x)",
  max20x: "Max (20x)",
};

export const planPrices: Record<(typeof supportedPlans)[number], string> = {
  pro: "$20/mo",
  max5x: "$100/mo",
  max20x: "$200/mo",
};

/**
 * Approximate token quotas per subscription plan — mirrored from
 * `src/model-settings.ts` `PLAN_QUOTAS` for display purposes.
 */
export const planQuotas: Record<
  (typeof supportedPlans)[number],
  { fiveHourTokens: number; weeklyTokens: number }
> = {
  pro: { fiveHourTokens: 44_000, weeklyTokens: 1_500_000 },
  max5x: { fiveHourTokens: 88_000, weeklyTokens: 7_500_000 },
  max20x: { fiveHourTokens: 220_000, weeklyTokens: 30_000_000 },
};

export const settingsFormSchema = z.object({
  selectedModel: z.enum(supportedModels),
  thinkingEnabled: z.boolean(),
  thinkingEffort: z.enum(thinkingEfforts),
  subscriptionPlan: z.enum(supportedPlans),
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
