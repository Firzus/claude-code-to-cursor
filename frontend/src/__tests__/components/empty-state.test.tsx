import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "~/components/empty-state";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState icon={Inbox} title="No items" description="There are no items to display." />,
    );

    expect(screen.getByText("No items")).toBeInTheDocument();
    expect(screen.getByText("There are no items to display.")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Empty"
        description="Nothing here."
        action={<button type="button">Add item</button>}
      />,
    );

    expect(screen.getByText("Add item")).toBeInTheDocument();
  });

  it("does not render action slot when not provided", () => {
    const { container } = render(
      <EmptyState icon={Inbox} title="Empty" description="Nothing here." />,
    );

    expect(container.querySelector("button")).toBeNull();
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmptyState icon={Inbox} title="Empty" description="Nothing." className="py-24" />,
    );

    expect(container.firstChild).toHaveClass("py-24");
  });
});
