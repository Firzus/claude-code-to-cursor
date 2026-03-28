import { getModelSettings, saveModelSettings } from "../db";
import { settingsPage } from "../html-templates";
import { validateModelSettings } from "../model-settings";

interface FormDataLike {
  get(name: string): string | Blob | null;
}

const LOCAL_SETTINGS_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOOPBACK_SETTINGS_ADDRESSES = new Set(["127.0.0.1", "::1"]);
const SETTINGS_HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
} as const;

function normalizeLoopbackSettingsAddress(address: string): string {
  const lowerAddress = address.toLowerCase();

  if (lowerAddress.startsWith("::ffff:")) {
    return lowerAddress.slice("::ffff:".length);
  }

  return lowerAddress;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: SETTINGS_HTML_HEADERS,
  });
}

export function isLoopbackSettingsAddress(
  address: string | null | undefined,
): boolean {
  if (!address) {
    return false;
  }

  return LOOPBACK_SETTINGS_ADDRESSES.has(
    normalizeLoopbackSettingsAddress(address),
  );
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

function sameOriginSettingsResponse(): Response {
  return htmlResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ccproxy — Forbidden</title></head><body>Settings updates require a same-origin browser submission.</body></html>`,
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

function isSameOriginSettingsRequest(req: Request): boolean {
  const expectedOrigin = new URL(req.url).origin;
  const originHeader = req.headers.get("Origin");
  const refererHeader = req.headers.get("Referer");

  if (originHeader === null && refererHeader === null) {
    return false;
  }

  if (originHeader !== null && originHeader !== expectedOrigin) {
    return false;
  }

  if (refererHeader !== null) {
    try {
      if (new URL(refererHeader).origin !== expectedOrigin) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return originHeader === expectedOrigin || refererHeader !== null;
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

  if (!isSameOriginSettingsRequest(req)) {
    return sameOriginSettingsResponse();
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
