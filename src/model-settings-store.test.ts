import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { DEFAULT_MODEL_SETTINGS } from "./model-settings";
import {
  getModelSettingsFromDb,
  initModelSettingsSchema,
  saveModelSettingsToDb,
} from "./model-settings-store";

describe("model settings store", () => {
  test("returns default settings when the database is empty", () => {
    const database = new Database(":memory:");

    try {
      initModelSettingsSchema(database);

      expect(getModelSettingsFromDb(database)).toEqual(DEFAULT_MODEL_SETTINGS);
    } finally {
      database.close();
    }
  });

  test("saves and loads model settings through sqlite", () => {
    const database = new Database(":memory:");

    try {
      initModelSettingsSchema(database);

      const settings = {
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: false,
        thinkingEffort: "medium",
        subscriptionPlan: "pro",
      } as const;

      saveModelSettingsToDb(database, settings);

      expect(getModelSettingsFromDb(database)).toEqual(settings);
    } finally {
      database.close();
    }
  });

  test("overwrites previously saved model settings on a second save", () => {
    const database = new Database(":memory:");

    try {
      initModelSettingsSchema(database);

      saveModelSettingsToDb(database, {
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: true,
        thinkingEffort: "high",
        subscriptionPlan: "max20x",
      });

      const updatedSettings = {
        selectedModel: "claude-opus-4-7",
        thinkingEnabled: false,
        thinkingEffort: "low",
        subscriptionPlan: "max5x",
      } as const;

      saveModelSettingsToDb(database, updatedSettings);

      expect(getModelSettingsFromDb(database)).toEqual(updatedSettings);
    } finally {
      database.close();
    }
  });

  test("falls back to default plan when the subscription_plan key is missing (legacy rows)", () => {
    const database = new Database(":memory:");

    try {
      initModelSettingsSchema(database);

      // Simulate a legacy database with only the 3 original keys
      database.run(
        `INSERT INTO model_settings (key, value) VALUES
          ('selected_model', 'claude-sonnet-4-6'),
          ('thinking_enabled', '1'),
          ('thinking_effort', 'medium')`,
      );

      expect(getModelSettingsFromDb(database)).toEqual({
        selectedModel: "claude-sonnet-4-6",
        thinkingEnabled: true,
        thinkingEffort: "medium",
        subscriptionPlan: "max20x",
      });
    } finally {
      database.close();
    }
  });
});
