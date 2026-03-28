import { getModelSettings, saveModelSettings } from "../db";
import { settingsPage } from "../html-templates";
import { validateModelSettings } from "../model-settings";

interface FormDataLike {
  get(name: string): string | Blob | null;
}

const LOCAL_SETTINGS_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOOPBACK_SETTINGS_ADDRESSES = new Set(["127.0.0.1", "::1"]);

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function isLoopbackSettingsAddress(
  address: string | null | undefined,
): boolean {
  if (!address) {
    return false;
  }

  return LOOPBACK_SETTINGS_ADDRESSES.has(address.toLowerCase());
}

export function isLocalSettingsHost(req: Request): boolean {
  return LOCAL_SETTINGS_HOSTS.has(new URL(req.url).hostname.toLowerCase());
}

export function localOnlySettingsResponse(): Response {
  return htmlResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ccproxy — Forbidden</title></head><body>Local access only</body></html>`,
    403,
  );
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
  if (!isLocalSettingsHost(req)) {
    return localOnlySettingsResponse();
  }

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
  if (!isLocalSettingsHost(req)) {
    return localOnlySettingsResponse();
  }

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
