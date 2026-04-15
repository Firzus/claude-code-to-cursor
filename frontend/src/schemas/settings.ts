import { z } from "zod";

export const supportedModels = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const;

export const modelLabels: Record<(typeof supportedModels)[number], string> = {
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-haiku-4-5": "Claude Haiku 4.5",
};

export const thinkingEfforts = ["low", "medium", "high"] as const;

export const cacheTTLValues = ["5m", "1h"] as const;

export const cacheTTLLabels: Record<(typeof cacheTTLValues)[number], string> = {
  "5m": "5 min",
  "1h": "1 hour",
};

export const keepaliveIntervalValues = ["off", "2m", "4m"] as const;

export const keepaliveIntervalLabels: Record<(typeof keepaliveIntervalValues)[number], string> = {
  off: "Off",
  "2m": "2 min",
  "4m": "4 min",
};

export const settingsFormSchema = z.object({
  selectedModel: z.enum(supportedModels),
  thinkingEnabled: z.boolean(),
  thinkingEffort: z.enum(thinkingEfforts),
  cacheTTL: z.enum(cacheTTLValues),
  keepaliveInterval: z.enum(keepaliveIntervalValues),
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
