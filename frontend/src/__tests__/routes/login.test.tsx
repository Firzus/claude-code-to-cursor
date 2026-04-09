import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let capturedComponent: React.FC | null = null;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.FC }) => {
    capturedComponent = opts.component;
    return { component: opts.component };
  },
}));

vi.mock("~/components/oauth-flow", () => ({
  OAuthFlow: () => <div data-testid="oauth-flow">OAuth Flow Mock</div>,
}));

describe("LoginPage", () => {
  it("renders the page with heading and OAuth flow", async () => {
    await import("~/routes/login");
    const LoginPage = capturedComponent!;

    render(<LoginPage />);

    expect(screen.getByText("Authentication")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-flow")).toBeInTheDocument();
  });
});
