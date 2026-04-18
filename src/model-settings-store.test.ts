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
        subscriptionPlan: "max20x",
      });

      const updatedSettings = {
        selectedModel: "claude-sonnet-4-6",
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

      // Simulate a legacy database with only the selected_model key
      database.run(
        `INSERT INTO model_settings (key, value) VALUES
          ('selected_model', 'claude-sonnet-4-6')`,
      );

      expect(getModelSettingsFromDb(database)).toEqual({
        selectedModel: "claude-sonnet-4-6",
        subscriptionPlan: "max20x",
      });
    } finally {
      database.close();
    }
  });

  test("ignores orphaned thinking_* legacy rows without crashing", () => {
    const database = new Database(":memory:");

    try {
      initModelSettingsSchema(database);

      // Simulate a real upgraded DB with both current and legacy orphan keys
      database.run(
        `INSERT INTO model_settings (key, value) VALUES
          ('selected_model', 'claude-opus-4-7'),
          ('subscription_plan', 'max20x'),
          ('thinking_enabled', '1'),
          ('thinking_effort', 'high')`,
      );

      expect(getModelSettingsFromDb(database)).toEqual({
        selectedModel: "claude-opus-4-7",
        subscriptionPlan: "max20x",
      });
    } finally {
      database.close();
    }
  });
});
