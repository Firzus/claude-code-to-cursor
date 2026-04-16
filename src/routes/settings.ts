import { timingSafeEqual } from "node:crypto";
import { getModelSettings, saveModelSettings } from "../db";
import { logger } from "../logger";
import { validateModelSettings } from "../model-settings";

if (!process.env.SETTINGS_API_KEY) {
  logger.warn("SETTINGS_API_KEY is not set — settings API is unrestricted");
}

function isAuthorizedSettingsRequest(req: Request): boolean {
  const apiKey = process.env.SETTINGS_API_KEY;
  if (!apiKey) return true;
  const provided = req.headers.get("x-settings-key") ?? "";
  if (provided.length !== apiKey.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(apiKey));
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
      thinkingEnabled:
        typeof body.thinkingEnabled === "boolean"
          ? body.thinkingEnabled
          : body.thinkingEnabled === "true",
      thinkingEffort: (body.thinkingEffort as string) ?? "",
      subscriptionPlan: body.subscriptionPlan,
    });

    saveModelSettings(settings);
    return Response.json({ success: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid model settings payload";
    return Response.json({ success: false, error: message }, { status: 400 });
  }
}
