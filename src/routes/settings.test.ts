import { describe, expect, mock, test } from "bun:test";
import type { ModelSettings } from "../model-settings";

const currentSettings: ModelSettings = {
  selectedModel: "claude-sonnet-4-6",
  thinkingEnabled: true,
  thinkingEffort: "medium",
};

const savedSettingsCalls: ModelSettings[] = [];

mock.module("../db", () => ({
  getModelSettings: () => currentSettings,
  saveModelSettings: (settings: ModelSettings) => {
    savedSettingsCalls.push(settings);
  },
}));

mock.module("../logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, verbose: () => {} },
}));

const {
  handleSettingsAPI,
  handleSettingsModelAPI,
} = await import("./settings");

describe("settings JSON API", () => {
  test("returns current settings as JSON", async () => {
    const response = handleSettingsAPI(
      new Request("http://localhost/api/settings"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settings.selectedModel).toBe("claude-sonnet-4-6");
    expect(body.settings.thinkingEnabled).toBe(true);
    expect(body.settings.thinkingEffort).toBe("medium");
  });

  test("rejects invalid model in JSON body", async () => {
    savedSettingsCalls.length = 0;

    const request = new Request("http://localhost/api/settings/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedModel: "claude-unknown",
        thinkingEnabled: true,
        thinkingEffort: "medium",
      }),
    });

    const response = await handleSettingsModelAPI(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain("Unsupported selectedModel");
    expect(savedSettingsCalls).toHaveLength(0);
  });

  test("saves valid settings via JSON body", async () => {
    savedSettingsCalls.length = 0;

    const request = new Request("http://localhost/api/settings/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedModel: "claude-haiku-4-5",
        thinkingEnabled: false,
        thinkingEffort: "low",
      }),
    });

    const response = await handleSettingsModelAPI(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.settings.selectedModel).toBe("claude-haiku-4-5");
    expect(savedSettingsCalls).toEqual([
      {
        selectedModel: "claude-haiku-4-5",
        thinkingEnabled: false,
        thinkingEffort: "low",
      },
    ]);
  });

  test("rejects request with wrong API key", async () => {
    // Set env var for this test
    const origKey = process.env.SETTINGS_API_KEY;
    process.env.SETTINGS_API_KEY = "test-secret";

    try {
      const response = handleSettingsAPI(
        new Request("http://localhost/api/settings"),
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toContain("Unauthorized");
    } finally {
      if (origKey === undefined) {
        delete process.env.SETTINGS_API_KEY;
      } else {
        process.env.SETTINGS_API_KEY = origKey;
      }
    }
  });

  test("allows request with correct API key", async () => {
    const origKey = process.env.SETTINGS_API_KEY;
    process.env.SETTINGS_API_KEY = "test-secret";

    try {
      const response = handleSettingsAPI(
        new Request("http://localhost/api/settings", {
          headers: { "x-settings-key": "test-secret" },
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.settings).toBeDefined();
    } finally {
      if (origKey === undefined) {
        delete process.env.SETTINGS_API_KEY;
      } else {
        process.env.SETTINGS_API_KEY = origKey;
      }
    }
  });
});
