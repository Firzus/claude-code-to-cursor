import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderWithQuery,
  requireCapturedRouteComponent,
  setupRouteComponentCapture,
} from "../test-utils";

setupRouteComponentCapture();

vi.mock("~/hooks/use-settings", () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
}));

import { useSettings, useUpdateSettings } from "~/hooks/use-settings";

const mockUseSettings = vi.mocked(useSettings);
const mockUseUpdateSettings = vi.mocked(useUpdateSettings);

async function renderSettingsPage() {
  await import("~/routes/settings");
  const SettingsPage = requireCapturedRouteComponent();
  return renderWithQuery(<SettingsPage />);
}

const mockSettings = {
  settings: {
    selectedModel: "claude-opus-4-7" as const,
    thinkingEnabled: true,
    thinkingEffort: "high" as const,
    subscriptionPlan: "max20x" as const,
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
    expect(screen.getByText("Claude Opus 4.7")).toBeInTheDocument();
    expect(screen.getByText("Claude Sonnet 4.6")).toBeInTheDocument();
    expect(screen.getByText("Claude Haiku 4.5")).toBeInTheDocument();
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
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.getByText("low")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("xhigh")).toBeInTheDocument();
    expect(screen.getByText("max")).toBeInTheDocument();
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
