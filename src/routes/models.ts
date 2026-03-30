import { getExposedModels, getContextLength } from "../model-settings";
import { getModelSettings } from "../db";

export function handleModels(): Response {
  const modelSettings = getModelSettings();
  const contextLength = getContextLength(modelSettings.selectedModel);

  return Response.json({
    object: "list",
    data: getExposedModels().map((id) => ({
      id,
      context_length: contextLength,
      max_output_tokens: 128000,
      object: "model",
      created: 1700000000,
      owned_by: "anthropic",
    })),
  });
}
