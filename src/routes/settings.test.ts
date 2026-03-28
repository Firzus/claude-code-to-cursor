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

const { handleSettingsPage, handleSettingsModel } = await import("./settings");

describe("settings routes", () => {
  test("returns the settings page for invalid form submissions", async () => {
    savedSettingsCalls.length = 0;

    const request = new Request("http://localhost/settings/model", {
      method: "POST",
      body: new URLSearchParams({
        selectedModel: "claude-unknown",
        thinkingEnabled: "on",
        thinkingEffort: "medium",
      }),
    });

    const response = await handleSettingsModel(request);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(savedSettingsCalls).toHaveLength(0);
    expect(body).toContain("Model settings");
    expect(body).toContain("Unsupported selectedModel: claude-unknown");
  });

  test("rejects malformed thinkingEnabled values", async () => {
    savedSettingsCalls.length = 0;

    const request = new Request("http://localhost/settings/model", {
      method: "POST",
      body: new URLSearchParams({
        selectedModel: "claude-haiku-4-5",
        thinkingEnabled: "maybe",
        thinkingEffort: "low",
      }),
    });

    const response = await handleSettingsModel(request);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(savedSettingsCalls).toHaveLength(0);
    expect(body).toContain("Model settings");
    expect(body).toContain("Invalid thinkingEnabled value");
  });

  test("saves valid thinkingEnabled=off settings and redirects back to the settings page", async () => {
    savedSettingsCalls.length = 0;

    const request = new Request("http://localhost/settings/model", {
      method: "POST",
      body: new URLSearchParams({
        selectedModel: "claude-haiku-4-5",
        thinkingEnabled: "off",
        thinkingEffort: "low",
      }),
    });

    const response = await handleSettingsModel(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/settings?saved=1");
    expect(savedSettingsCalls).toEqual([
      {
        selectedModel: "claude-haiku-4-5",
        thinkingEnabled: false,
        thinkingEffort: "low",
      },
    ]);
  });

  test("renders the current active configuration on the settings page", async () => {
    const response = await handleSettingsPage(
      new Request("http://localhost/settings?saved=1"),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Active configuration");
    expect(body).toContain("claude-sonnet-4-6");
    expect(body).toContain("Thinking enabled");
    expect(body).toContain("Changes saved.");
  });
});
