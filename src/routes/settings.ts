import { getModelSettings, saveModelSettings } from "../db";
import { settingsPage } from "../html-templates";
import { validateModelSettings } from "../model-settings";

interface FormDataLike {
  get(name: string): string | Blob | null;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function getStringField(formData: FormDataLike, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parseThinkingEnabled(value: string): boolean {
  if (value === "on" || value === "true") {
    return true;
  }

  if (value === "off" || value === "false") {
    return false;
  }

  throw new Error("Invalid thinkingEnabled value");
}

export function handleSettingsPage(req: Request): Response {
  const url = new URL(req.url);
  const notice =
    url.searchParams.get("saved") === "1"
      ? { kind: "success" as const, message: "Changes saved." }
      : undefined;

  return htmlResponse(
    settingsPage({
      settings: getModelSettings(),
      notice,
    }),
  );
}

export async function handleSettingsModel(req: Request): Promise<Response> {
  const currentSettings = getModelSettings();

  try {
    const formData = await req.formData();
    const settings = validateModelSettings({
      selectedModel: getStringField(formData, "selectedModel"),
      thinkingEnabled: parseThinkingEnabled(
        getStringField(formData, "thinkingEnabled"),
      ),
      thinkingEffort: getStringField(formData, "thinkingEffort"),
    });

    saveModelSettings(settings);

    return new Response(null, {
      status: 303,
      headers: { Location: "/settings?saved=1" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid model settings payload";

    return htmlResponse(
      settingsPage({
        settings: currentSettings,
        notice: { kind: "error", message },
      }),
      400,
    );
  }
}
