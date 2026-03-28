import { getExposedModels } from "../model-settings";

export function handleModels(): Response {
  return Response.json({
    object: "list",
    data: getExposedModels().map((id) => ({
      id,
      context_length: 200000,
      max_output_tokens: 128000,
      object: "model",
      created: 1700000000,
      owned_by: "anthropic",
    })),
  });
}
