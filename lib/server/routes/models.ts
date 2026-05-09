import { cacheLife, cacheTag } from "next/cache";
import { getModelSettings } from "../db";
import { getContextLength, getExposedModels } from "../model-settings";

// Cache the payload (not the Response) so the same JSON is reused across
// requests until either an hour elapses (cacheLife) or the user changes
// preferences (revalidateTag('settings') in lib/server-actions.ts).
async function getModelsPayload() {
  "use cache";
  cacheTag("settings");
  cacheLife("hours");

  const modelSettings = await getModelSettings();
  const contextLength = getContextLength(modelSettings.selectedModel);

  return {
    object: "list" as const,
    data: getExposedModels().map((id) => ({
      id,
      context_length: contextLength,
      context_window: contextLength,
      max_output_tokens: 128000,
      object: "model" as const,
      created: 1700000000,
      owned_by: "anthropic",
    })),
  };
}

export async function handleModels(): Promise<Response> {
  return Response.json(await getModelsPayload());
}
