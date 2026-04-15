import type { Database } from "bun:sqlite";
import type { ModelSettings } from "./model-settings";
import { DEFAULT_MODEL_SETTINGS, validateModelSettings } from "./model-settings";

type ModelSettingKey = "selected_model" | "thinking_enabled" | "thinking_effort" | "cache_ttl";

interface ModelSettingsRow {
  key: ModelSettingKey;
  value: string;
}

const MODEL_SETTINGS_TABLE = "model_settings";

function upsertSetting(database: Database, key: ModelSettingKey, value: string): void {
  database.run(
    `INSERT INTO ${MODEL_SETTINGS_TABLE} (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

function getSettingMap(database: Database): Map<ModelSettingKey, string> {
  const rows = database
    .query(`SELECT key, value FROM ${MODEL_SETTINGS_TABLE}`)
    .all() as ModelSettingsRow[];

  return new Map(rows.map((row) => [row.key, row.value]));
}

function toStoredBoolean(value: boolean): string {
  return value ? "1" : "0";
}

function fromStoredBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function initModelSettingsSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS ${MODEL_SETTINGS_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

export function getModelSettingsFromDb(database: Database): ModelSettings {
  const settings = getSettingMap(database);

  if (settings.size === 0) {
    return DEFAULT_MODEL_SETTINGS;
  }

  const selectedModel = settings.get("selected_model") ?? DEFAULT_MODEL_SETTINGS.selectedModel;
  const thinkingEnabledValue = settings.get("thinking_enabled");
  const thinkingEffortValue = settings.get("thinking_effort");
  const cacheTTLValue = settings.get("cache_ttl");

  try {
    return validateModelSettings({
      selectedModel,
      thinkingEnabled:
        thinkingEnabledValue === undefined
          ? DEFAULT_MODEL_SETTINGS.thinkingEnabled
          : fromStoredBoolean(thinkingEnabledValue),
      thinkingEffort:
        (thinkingEffortValue as ModelSettings["thinkingEffort"] | undefined) ??
        DEFAULT_MODEL_SETTINGS.thinkingEffort,
      cacheTTL:
        (cacheTTLValue as ModelSettings["cacheTTL"] | undefined) ?? DEFAULT_MODEL_SETTINGS.cacheTTL,
    });
  } catch {
    console.warn(`Invalid model settings in DB (selectedModel="${selectedModel}"), using defaults`);
    return DEFAULT_MODEL_SETTINGS;
  }
}

export function saveModelSettingsToDb(database: Database, settings: ModelSettings): void {
  const saveSettings = database.transaction((currentSettings: ModelSettings) => {
    upsertSetting(database, "selected_model", currentSettings.selectedModel);
    upsertSetting(database, "thinking_enabled", toStoredBoolean(currentSettings.thinkingEnabled));
    upsertSetting(database, "thinking_effort", currentSettings.thinkingEffort);
    upsertSetting(database, "cache_ttl", currentSettings.cacheTTL);
  });

  saveSettings(settings);
}
