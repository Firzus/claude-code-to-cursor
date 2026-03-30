import { getModelSettings, saveModelSettings } from "../db";
import { validateModelSettings } from "../model-settings";

function isAuthorizedSettingsRequest(req: Request): boolean {
  const apiKey = process.env.SETTINGS_API_KEY;
  if (!apiKey) return true; // No key configured = unrestricted (dev mode / Docker internal)
  const provided = req.headers.get("x-settings-key");
  return provided === apiKey;
}

export function handleSettingsAPI(req: Request): Response {
  if (!isAuthorizedSettingsRequest(req)) {
    return Response.json(
      { error: "Unauthorized: invalid or missing settings API key." },
      { status: 403 },
    );
  }

  return Response.json({ settings: getModelSettings() });
}

export async function handleSettingsModelAPI(req: Request): Promise<Response> {
  if (!isAuthorizedSettingsRequest(req)) {
    return Response.json(
      { error: "Unauthorized: invalid or missing settings API key." },
      { status: 403 },
    );
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const settings = validateModelSettings({
      selectedModel: (body.selectedModel as string) ?? "",
      thinkingEnabled: typeof body.thinkingEnabled === "boolean"
        ? body.thinkingEnabled
        : body.thinkingEnabled === "true",
      thinkingEffort: (body.thinkingEffort as string) ?? "",
    });

    saveModelSettings(settings);
    return Response.json({ success: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid model settings payload";
    return Response.json({ success: false, error: message }, { status: 400 });
  }
}
