import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery, setupRouteComponentCapture } from "../test-utils";

const { getCapturedComponent } = setupRouteComponentCapture();

vi.mock("~/hooks/use-settings", () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
}));

import { useSettings, useUpdateSettings } from "~/hooks/use-settings";

const mockUseSettings = vi.mocked(useSettings);
const mockUseUpdateSettings = vi.mocked(useUpdateSettings);

async function renderSettingsPage() {
  await import("~/routes/settings");
  const SettingsPage = getCapturedComponent()!;
  return renderWithQuery(<SettingsPage />);
}

const mockSettings = {
  settings: {
    selectedModel: "claude-opus-4-6" as const,
    thinkingEnabled: true,
    thinkingEffort: "high" as const,
    adaptiveRouting: true,
    continuationModel: "claude-sonnet-4-6" as const,
  },
};

beforeEach(() => {
  vi.clearAllMocks();

  mockUseUpdateSettings.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
  } as never);
});

describe("SettingsPage", () => {
  it("shows loading skeleton", async () => {
    mockUseSettings.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);

    await renderSettingsPage();

    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("shows error state", async () => {
    mockUseSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as never);

    await renderSettingsPage();

    expect(screen.getByText("Failed to load settings.")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("renders settings form with model cards", async () => {
    mockUseSettings.mockReturnValue({
      data: mockSettings,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    await renderSettingsPage();

    expect(screen.getByText("Settings")).toBeInTheDocument();
    // Each model label appears twice: once in the main Model card,
    // once in the Adaptive Routing continuation model selector.
    expect(screen.getAllByText("Claude Opus 4.6")).toHaveLength(2);
    expect(screen.getAllByText("Claude Sonnet 4.6")).toHaveLength(2);
    expect(screen.getAllByText("Claude Haiku 4.5")).toHaveLength(2);
  });

  it("renders thinking toggle and effort buttons", async () => {
    mockUseSettings.mockReturnValue({
      data: mockSettings,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    await renderSettingsPage();

    expect(screen.getByText("Extended Thinking")).toBeInTheDocument();
    // Two switches: Extended Thinking toggle + Adaptive Routing toggle
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    expect(screen.getByText("low")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("renders the adaptive routing card", async () => {
    mockUseSettings.mockReturnValue({
      data: mockSettings,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    await renderSettingsPage();

    expect(screen.getByText("Adaptive Routing")).toBeInTheDocument();
    expect(screen.getByLabelText("Toggle adaptive routing")).toBeInTheDocument();
    expect(screen.getByText("Continuation model")).toBeInTheDocument();
  });

  it("shows save and discard buttons", async () => {
    mockUseSettings.mockReturnValue({
      data: mockSettings,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    await renderSettingsPage();

    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("calls refetch on try again click", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();

    mockUseSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);

    await renderSettingsPage();

    await user.click(screen.getByText("Try again"));
    expect(refetch).toHaveBeenCalled();
  });
});
