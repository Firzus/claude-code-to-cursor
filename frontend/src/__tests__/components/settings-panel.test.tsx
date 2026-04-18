import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EffortStrip } from "~/components/settings/effort-strip";
import { Panel, PanelRow } from "~/components/settings/panel";
import { SelectorRow } from "~/components/settings/selector-row";
import { ToggleAscii } from "~/components/settings/toggle-ascii";

describe("Panel", () => {
  it("renders index, title, hint and footer", () => {
    render(
      <Panel index="01 ·" title="model" hint="ctx · capability" footer={<span>$ done</span>}>
        <PanelRow label="effort">
          <span>high</span>
        </PanelRow>
      </Panel>,
    );

    expect(screen.getByText("01 ·")).toBeInTheDocument();
    expect(screen.getByText("model")).toBeInTheDocument();
    expect(screen.getByText("ctx · capability")).toBeInTheDocument();
    expect(screen.getByText("$ done")).toBeInTheDocument();
    expect(screen.getByText("effort")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
  });
});

describe("ToggleAscii", () => {
  it("toggles state on click and exposes role=switch", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToggleAscii checked={false} onChange={onChange} ariaLabel="toggle" />);

    const toggle = screen.getByRole("switch", { name: "toggle" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("off")).toBeInTheDocument();

    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders ON label when checked", () => {
    render(<ToggleAscii checked onChange={() => {}} ariaLabel="toggle" />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("on")).toBeInTheDocument();
  });
});

describe("SelectorRow", () => {
  it("renders id, meta and selection state", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SelectorRow
        id="opus_4_7"
        name="Claude Opus 4.7"
        meta="1M ctx · most capable"
        selected={false}
        onSelect={onSelect}
        ariaLabel="Claude Opus 4.7"
      />,
    );

    const row = screen.getByRole("radio", { name: "Claude Opus 4.7" });
    expect(row).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("opus_4_7")).toBeInTheDocument();
    expect(screen.getByText("1M ctx · most capable")).toBeInTheDocument();
    expect(screen.getByText("[ ]")).toBeInTheDocument();

    await user.click(row);
    expect(onSelect).toHaveBeenCalled();
  });

  it("shows checked marker when selected", () => {
    render(
      <SelectorRow id="opus_4_7" name="Claude Opus 4.7" meta="meta" selected onSelect={() => {}} />,
    );
    expect(screen.getByText("[●]")).toBeInTheDocument();
    expect(screen.getByRole("radio")).toHaveAttribute("aria-checked", "true");
  });
});

describe("EffortStrip", () => {
  const efforts = ["low", "medium", "high", "xhigh", "max"] as const;

  it("renders all options as radios and marks the selected one", () => {
    render(<EffortStrip options={efforts} value="high" onChange={() => {}} />);

    for (const e of efforts) {
      expect(screen.getByRole("radio", { name: e })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "high" })).toHaveAttribute("aria-checked", "true");
  });

  it("calls onChange when an option is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EffortStrip options={efforts} value="high" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: "max" }));
    expect(onChange).toHaveBeenCalledWith("max");
  });
});
