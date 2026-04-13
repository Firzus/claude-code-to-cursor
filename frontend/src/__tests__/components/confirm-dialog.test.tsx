import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "~/components/analytics/confirm-dialog";

const defaultProps = {
  open: true,
  title: "Confirm action",
  description: "Are you sure?",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders title and description when open", () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText("Confirm action")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("has accessible dialog role and aria attributes", () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(dialog).toHaveAttribute("aria-describedby");
  });

  it("calls onCancel when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);
    await user.keyboard("{Escape}");
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it("calls onConfirm when Reset button is clicked", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);
    await user.click(screen.getByText("Reset"));
    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);
    await user.click(screen.getByText("Cancel"));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it("calls onCancel when backdrop overlay is clicked", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);
    const overlay = screen.getByRole("dialog").querySelector("[aria-hidden='true']")!;
    await user.click(overlay);
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });
});
