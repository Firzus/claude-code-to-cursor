import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { setupRouteComponentCapture } from "../test-utils";

const { getCapturedComponent } = setupRouteComponentCapture();

vi.mock("~/components/oauth-flow", () => ({
  OAuthFlow: () => <div data-testid="oauth-flow">OAuth Flow Mock</div>,
}));

describe("LoginPage", () => {
  it("renders the page with heading and OAuth flow", async () => {
    await import("~/routes/login");
    const LoginPage = getCapturedComponent()!;

    render(<LoginPage />);

    expect(screen.getByText("Authentication")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-flow")).toBeInTheDocument();
  });
});
