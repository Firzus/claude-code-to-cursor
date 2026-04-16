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

export const settingsFormSchema = z.object({
  selectedModel: z.enum(supportedModels),
  thinkingEnabled: z.boolean(),
  thinkingEffort: z.enum(thinkingEfforts),
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
