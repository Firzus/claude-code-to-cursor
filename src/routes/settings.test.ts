import { describe, expect, mock, test } from "bun:test";
import type { ModelSettings } from "../model-settings";

const SKIP = !!process.env.SKIP_MOCK_MODULE_TESTS;

interface SettingsGetResponse {
  settings: ModelSettings;
  error?: string;
}

interface SettingsUpdateResponse {
  success: boolean;
  settings?: ModelSettings;
  error?: string;
}

if (!SKIP) {
  const currentSettings: ModelSettings = {
    selectedModel: "claude-sonnet-4-6",
    thinkingEnabled: true,
    thinkingEffort: "medium",
    subscriptionPlan: "max20x",
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

  const { handleSettingsAPI, handleSettingsModelAPI } = await import("./settings");

  describe("settings JSON API", () => {
    test("returns current settings as JSON", async () => {
      const response = handleSettingsAPI(new Request("http://localhost/api/settings"));
      const body = (await response.json()) as SettingsGetResponse;

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
      const body = (await response.json()) as SettingsUpdateResponse;

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
          subscriptionPlan: "pro",
        }),
      });

      const response = await handleSettingsModelAPI(request);
      const body = (await response.json()) as SettingsUpdateResponse;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.settings?.selectedModel).toBe("claude-haiku-4-5");
      expect(body.settings?.subscriptionPlan).toBe("pro");
      expect(savedSettingsCalls).toEqual([
        {
          selectedModel: "claude-haiku-4-5",
          thinkingEnabled: false,
          thinkingEffort: "low",
          subscriptionPlan: "pro",
        },
      ]);
    });

    test("rejects invalid subscriptionPlan in JSON body", async () => {
      savedSettingsCalls.length = 0;

      const request = new Request("http://localhost/api/settings/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedModel: "claude-haiku-4-5",
          thinkingEnabled: false,
          thinkingEffort: "low",
          subscriptionPlan: "enterprise",
        }),
      });

      const response = await handleSettingsModelAPI(request);
      const body = (await response.json()) as SettingsUpdateResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain("subscriptionPlan");
      expect(savedSettingsCalls).toHaveLength(0);
    });

    test("rejects request with wrong API key", async () => {
      const origKey = process.env.SETTINGS_API_KEY;
      process.env.SETTINGS_API_KEY = "test-secret";

      try {
        const response = handleSettingsAPI(new Request("http://localhost/api/settings"));
        const body = (await response.json()) as SettingsGetResponse;

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
        const body = (await response.json()) as SettingsGetResponse;

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
} else {
  test.skip("settings JSON API (skipped: SKIP_MOCK_MODULE_TESTS)", () => {});
}
