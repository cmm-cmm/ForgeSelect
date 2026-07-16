import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import ForgeSelectReact from "../src/index";

// Silences React's "not configured to support act(...)" warning under vitest.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(props: Record<string, unknown>): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(ForgeSelectReact, props));
  });
  return { container, root };
}

describe("ForgeSelectReact", () => {
  it("mounts a ForgeSelect instance inside the container", () => {
    const { container } = mount({
      placeholder: "Pick one",
      data: [{ value: "a", label: "A" }],
    });
    expect(container.querySelector(".forge-select")).not.toBeNull();
    expect(container.querySelector(".forge-select__placeholder")?.textContent).toBe("Pick one");
  });

  it("calls onChange when a value is selected", () => {
    const onChange = vi.fn();
    const { container } = mount({
      data: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      onChange,
    });

    act(() => {
      container.querySelector<HTMLElement>(".forge-select__control")!.click();
    });
    act(() => {
      container.querySelectorAll<HTMLElement>(".forge-select__option")[1].click();
    });

    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("syncs a controlled value prop after mount", () => {
    const data = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ];
    const { container, root } = mount({ data, value: "a" });
    expect(container.querySelector(".forge-select__single-value")?.textContent).toBe("A");

    act(() => {
      root.render(createElement(ForgeSelectReact, { data, value: "b" }));
    });
    expect(container.querySelector(".forge-select__single-value")?.textContent).toBe("B");
  });

  it("does not call onChange for prop synchronization and uses the latest callback", () => {
    const data = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ];
    const first = vi.fn();
    const latest = vi.fn();
    const { container, root } = mount({ data, value: "a", onChange: first });
    act(() => root.render(createElement(ForgeSelectReact, { data, value: "b", onChange: latest })));
    expect(first).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
    act(() => container.querySelector<HTMLElement>(".forge-select__control")!.click());
    act(() => container.querySelectorAll<HTMLElement>(".forge-select__option")[0].click());
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith("a");
  });

  it("destroys the instance on unmount", () => {
    const { container, root } = mount({ data: [{ value: "a", label: "A" }] });
    expect(container.querySelector(".forge-select")).not.toBeNull();

    act(() => {
      root.unmount();
    });
    expect(container.querySelector(".forge-select")).toBeNull();
  });
});
