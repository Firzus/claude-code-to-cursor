import type { Database } from "bun:sqlite";
import type { ModelSettings } from "./model-settings";
import { DEFAULT_MODEL_SETTINGS, validateModelSettings } from "./model-settings";

type ModelSettingKey = "selected_model" | "subscription_plan";

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
  const subscriptionPlanValue = settings.get("subscription_plan");

  try {
    return validateModelSettings({
      selectedModel,
      subscriptionPlan:
        (subscriptionPlanValue as ModelSettings["subscriptionPlan"] | undefined) ??
        DEFAULT_MODEL_SETTINGS.subscriptionPlan,
    });
  } catch {
    console.warn(`Invalid model settings in DB (selectedModel="${selectedModel}"), using defaults`);
    return DEFAULT_MODEL_SETTINGS;
  }
}

export function saveModelSettingsToDb(database: Database, settings: ModelSettings): void {
  const saveSettings = database.transaction((currentSettings: ModelSettings) => {
    upsertSetting(database, "selected_model", currentSettings.selectedModel);
    upsertSetting(database, "subscription_plan", currentSettings.subscriptionPlan);
  });

  saveSettings(settings);
}
