import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthFlow } from "~/components/oauth-flow";

vi.mock("~/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "~/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OAuthFlow", () => {
  it("renders the 3 steps", () => {
    render(<OAuthFlow />);

    expect(screen.getByText("Start authorization")).toBeInTheDocument();
    expect(screen.getByText("Approve and copy the code")).toBeInTheDocument();
    expect(screen.getByText("Paste the code")).toBeInTheDocument();
  });

  it("shows Initialize button initially", () => {
    render(<OAuthFlow />);
    expect(screen.getByRole("button", { name: /initialize/i })).toBeInTheDocument();
  });

  it("calls initLogin on click and shows auth link", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce({
      authURL: "https://anthropic.com/auth?code=test",
      state: "abc123",
    });

    render(<OAuthFlow />);

    await user.click(screen.getByRole("button", { name: /initialize/i }));

    await waitFor(() => {
      expect(screen.getByText(/open anthropic/i)).toBeInTheDocument();
    });

    const link = screen.getByText(/open anthropic/i).closest("a");
    expect(link).toHaveAttribute("href", "https://anthropic.com/auth?code=test");
  });

  it("shows error when initLogin fails", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValueOnce(new Error("Network failure"));

    render(<OAuthFlow />);

    await user.click(screen.getByRole("button", { name: /initialize/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to initialize/)).toBeInTheDocument();
    });
  });

  it("code input is disabled before login initialization", () => {
    render(<OAuthFlow />);

    const input = screen.getByPlaceholderText(/paste code/i);
    expect(input).toBeDisabled();
  });

  it("submit button is disabled before login initialization", () => {
    render(<OAuthFlow />);
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("calls onSuccess callback after successful code submission", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    mockApiFetch
      .mockResolvedValueOnce({
        authURL: "https://anthropic.com/auth",
        state: "state123",
      })
      .mockResolvedValueOnce({
        success: true,
        message: "Authenticated successfully",
      });

    render(<OAuthFlow onSuccess={onSuccess} />);

    await user.click(screen.getByRole("button", { name: /initialize/i }));
    await waitFor(() => {
      expect(screen.getByText(/open anthropic/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/paste code/i);
    await user.type(input, "auth-code-123");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
