import { getModelSettings } from "../db";
import { getContextLength, getExposedModels } from "../model-settings";

export function handleModels(): Response {
  const modelSettings = getModelSettings();
  const contextLength = getContextLength(modelSettings.selectedModel);

  return Response.json({
    object: "list",
    data: getExposedModels().map((id) => ({
      id,
      context_length: contextLength,
      context_window: contextLength,
      max_output_tokens: 128000,
      object: "model",
      created: 1700000000,
      owned_by: "anthropic",
    })),
  });
}
