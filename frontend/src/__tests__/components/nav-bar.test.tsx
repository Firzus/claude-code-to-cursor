import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavBar } from "~/components/nav-bar";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: () => ({
    location: { pathname: "/analytics", search: {} },
  }),
}));

vi.mock("~/components/health-indicator", () => ({
  HealthIndicator: () => <div data-testid="health-indicator">Online</div>,
}));

describe("NavBar", () => {
  it("renders the brand name", () => {
    render(<NavBar />);
    // The new brand splits across multiple spans, use a flexible matcher.
    expect(screen.getByLabelText("claude-code-to-cursor home")).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(<NavBar />);

    expect(screen.getAllByText("analytics").length).toBeGreaterThan(0);
    expect(screen.getAllByText("settings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("setup").length).toBeGreaterThan(0);
  });

  it("renders health indicator", () => {
    render(<NavBar />);

    expect(screen.getByTestId("health-indicator")).toBeInTheDocument();
  });

  it("toggles mobile menu", async () => {
    const user = userEvent.setup();
    render(<NavBar />);

    const menuButton = screen.getByLabelText("Open menu");
    await user.click(menuButton);

    const closeButton = screen.getByLabelText("Close menu");
    expect(closeButton).toBeInTheDocument();
  });

  it("renders Setup link", () => {
    render(<NavBar />);
    expect(screen.getAllByText("setup").length).toBeGreaterThan(0);
  });
});
