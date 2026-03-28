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
        selectedModel: "claude-opus-4-6",
        thinkingEnabled: false,
        thinkingEffort: "medium",
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
        selectedModel: "claude-opus-4-6",
        thinkingEnabled: true,
        thinkingEffort: "high",
      });

      const updatedSettings = {
        selectedModel: "claude-opus-4-6",
        thinkingEnabled: false,
        thinkingEffort: "low",
      } as const;

      saveModelSettingsToDb(database, updatedSettings);

      expect(getModelSettingsFromDb(database)).toEqual(updatedSettings);
    } finally {
      database.close();
    }
  });
});
