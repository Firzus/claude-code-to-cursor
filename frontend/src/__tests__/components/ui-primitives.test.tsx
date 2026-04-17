import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Alert } from "~/components/ui/alert";
import { Dialog } from "~/components/ui/dialog";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Segmented } from "~/components/ui/segmented";

describe("Alert", () => {
  it("renders title and description with the appropriate role", () => {
    render(<Alert variant="error" title="Broken" description="Something failed." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent("Broken");
    expect(alert).toHaveTextContent("Something failed.");
  });

  it("info variant uses polite live region", () => {
    render(<Alert variant="info" title="FYI" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders an action slot", () => {
    render(
      <Alert variant="warning" title="Heads up" action={<button type="button">undo</button>} />,
    );
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
  });
});

describe("Input", () => {
  it("renders a native input with the given placeholder", () => {
    render(<Input placeholder="type here" />);
    expect(screen.getByPlaceholderText("type here")).toBeInTheDocument();
  });

  it("supports aria-invalid when invalid prop is set", () => {
    render(<Input aria-label="code" invalid />);
    expect(screen.getByLabelText("code")).toHaveAttribute("aria-invalid", "true");
  });

  it("wraps leading and trailing visuals", () => {
    render(
      <Input
        aria-label="search"
        leading={<span data-testid="lead">L</span>}
        trailing={<span data-testid="trail">T</span>}
      />,
    );
    expect(screen.getByTestId("lead")).toBeInTheDocument();
    expect(screen.getByTestId("trail")).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("associates label and error with the control", () => {
    render(
      <Field label="Code" error="required">
        <Input aria-label="code input" />
      </Field>,
    );
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("required");
  });
});

describe("Segmented", () => {
  it("renders options and marks the selected one", () => {
    function Harness() {
      const [value, setValue] = useState<"a" | "b">("a");
      return (
        <Segmented<"a" | "b">
          ariaLabel="letters"
          options={[
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ]}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);
    const a = screen.getByRole("radio", { name: "A" });
    const b = screen.getByRole("radio", { name: "B" });
    expect(a).toHaveAttribute("aria-checked", "true");
    expect(b).toHaveAttribute("aria-checked", "false");
  });

  it("changes value on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Segmented<"a" | "b">
        ariaLabel="letters"
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("arrow keys move the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Segmented<"a" | "b" | "c">
        ariaLabel="letters"
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    screen.getByRole("radio", { name: "A" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("b");
  });
});

describe("Dialog", () => {
  it("does not render when closed", () => {
    render(<Dialog open={false} onOpenChange={() => {}} title="Hi" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders with ARIA wiring when open", () => {
    render(<Dialog open onOpenChange={() => {}} title="Hello" description="world" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Dialog open onOpenChange={onOpenChange} title="X" />);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
