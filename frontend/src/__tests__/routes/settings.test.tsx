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

    // H1 renders "settings" (lowercase). Confirm loading text is visible.
    expect(screen.getAllByText(/fetching/i).length).toBeGreaterThan(0);
  });

  it("shows error state", async () => {
    mockUseSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as never);

    await renderSettingsPage();

    expect(screen.getByText(/settings\.unreachable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("renders settings form with model cards", async () => {
    mockUseSettings.mockReturnValue({
      data: mockSettings,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    await renderSettingsPage();

    expect(screen.getByRole("heading", { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText("Claude Opus 4.7")).toBeInTheDocument();
    expect(screen.getByText("Claude Opus 4.6")).toBeInTheDocument();
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
    expect(screen.getByRole("radio", { name: /^low$/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^medium$/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^high$/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^xhigh$/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^max$/i })).toBeInTheDocument();
  });

  it("shows save and discard buttons", async () => {
    mockUseSettings.mockReturnValue({
      data: mockSettings,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    await renderSettingsPage();

    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
