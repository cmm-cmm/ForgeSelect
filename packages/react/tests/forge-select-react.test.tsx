import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import ForgeSelect from "forge-select";
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
  it("synchronizes runtime options and controlled open/search state", () => {
    const data = [{ value: "dn", label: "Đà Nẵng" }];
    const { container, root } = mount({ data, placeholder: "Before", open: false });
    act(() => {
      root.render(
        createElement(ForgeSelectReact, { data, placeholder: "After", theme: "dark", open: true, searchQuery: "da" }),
      );
    });
    expect(container.querySelector(".forge-select__placeholder")?.textContent).toBe("After");
    expect(container.querySelector<HTMLElement>(".forge-select")?.dataset.theme).toBe("dark");
    expect(container.querySelector<HTMLElement>(".forge-select__dropdown")?.hidden).toBe(false);
    expect(container.querySelector<HTMLInputElement>(".forge-select__search")?.value).toBe("da");
  });

  it("does not call updateOptions on a re-render with unchanged option values", () => {
    const updateOptionsSpy = vi.spyOn(ForgeSelect.prototype, "updateOptions");
    const props = { data: [{ value: "a", label: "A" }], placeholder: "Same" };
    const { root } = mount(props);
    updateOptionsSpy.mockClear();

    // A parent re-render passing an equivalent (but newly-allocated) props
    // object must not trigger updateOptions() — it would otherwise clear
    // render caches and reset an open dropdown's scroll position on every
    // unrelated parent re-render.
    act(() => {
      root.render(createElement(ForgeSelectReact, { ...props }));
    });
    expect(updateOptionsSpy).not.toHaveBeenCalled();

    act(() => {
      root.render(createElement(ForgeSelectReact, { ...props, placeholder: "Changed" }));
    });
    expect(updateOptionsSpy).toHaveBeenCalledTimes(1);

    updateOptionsSpy.mockRestore();
  });

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

  it("updates rendered options when the data prop changes", () => {
    const { container, root } = mount({ data: [{ value: "a", label: "A" }] });
    act(() => container.querySelector<HTMLElement>(".forge-select__control")!.click());
    expect(container.querySelectorAll(".forge-select__option")).toHaveLength(1);
    act(() => {
      root.render(
        createElement(ForgeSelectReact, {
          data: [
            { value: "b", label: "B" },
            { value: "c", label: "C" },
          ],
        }),
      );
    });
    expect(container.querySelectorAll(".forge-select__option")).toHaveLength(2);
  });

  it("forwards detailed selection callbacks", () => {
    const onSelect = vi.fn();
    const { container } = mount({ data: [{ value: "a", label: "A" }], onSelect });
    act(() => container.querySelector<HTMLElement>(".forge-select__control")!.click());
    act(() => container.querySelector<HTMLElement>(".forge-select__option")!.click());
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: "a" }));
  });

  it("forwards onUnselect when a tag is removed", () => {
    const onUnselect = vi.fn();
    const { container } = mount({
      multiple: true,
      data: [{ value: "a", label: "A" }],
      value: ["a"],
      onUnselect,
    });
    act(() => container.querySelector<HTMLElement>(".forge-select__tag-remove")!.click());
    expect(onUnselect).toHaveBeenCalledWith(expect.objectContaining({ value: "a" }));
  });

  it("forwards onCreate when a new tag is created via allowCreate", () => {
    const onCreate = vi.fn();
    const { container } = mount({ multiple: true, allowCreate: true, onCreate });
    act(() => container.querySelector<HTMLElement>(".forge-select__control")!.click());
    act(() => {
      const input = container.querySelector<HTMLInputElement>(".forge-select__search")!;
      input.value = "Wakanda";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => container.querySelector<HTMLElement>(".forge-select__option--create")!.click());
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ value: "Wakanda" }));
  });

  it("forwards onReorder when a focused tag is moved via Alt+ArrowRight", () => {
    const onReorder = vi.fn();
    const { container } = mount({
      multiple: true,
      sortable: true,
      data: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      value: ["a", "b"],
      onReorder,
    });
    const tag = container.querySelector<HTMLElement>(".forge-select__tag")!;
    act(() => {
      tag.focus();
      tag.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }));
    });
    expect(onReorder).toHaveBeenCalledWith(["b", "a"]);
  });

  it("forwards onMaximum when a pick is rejected by maxSelections", () => {
    const onMaximum = vi.fn();
    const { container } = mount({
      multiple: true,
      maxSelections: 1,
      data: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      value: ["a"],
      onMaximum,
    });
    act(() => container.querySelector<HTMLElement>(".forge-select__control")!.click());
    const rejected = Array.from(container.querySelectorAll<HTMLElement>(".forge-select__option")).find(
      (li) => li.textContent === "B",
    )!;
    act(() => rejected.click());
    expect(onMaximum).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
  });

  it("forwards onInvalid when the underlying required select fails validation", () => {
    const onInvalid = vi.fn();
    const { container } = mount({ required: true, onInvalid });
    const nativeSelect = container.querySelector<HTMLSelectElement>("select")!;
    act(() => {
      nativeSelect.dispatchEvent(new Event("invalid", { cancelable: true }));
    });
    expect(onInvalid).toHaveBeenCalledWith(expect.any(String));
  });

  it("forwards onError and onLoading for a failed ajax request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const onError = vi.fn();
    const onLoading = vi.fn();
    const { container } = mount({ ajax: { url: "/api", debounce: 0 }, onError, onLoading });
    act(() => container.querySelector<HTMLElement>(".forge-select__control")!.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(onLoading).toHaveBeenCalledWith(true);
    expect(onLoading).toHaveBeenCalledWith(false);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    vi.unstubAllGlobals();
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

  it("forwards open, close, search, clear, and error callbacks", () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onSearch = vi.fn();
    const onClear = vi.fn();
    const { container } = mount({
      clearable: true,
      data: [{ value: "a", label: "A" }],
      value: "a",
      onOpen,
      onClose,
      onSearch,
      onClear,
    });

    act(() => container.querySelector<HTMLElement>(".forge-select__control")!.click());
    expect(onOpen).toHaveBeenCalledTimes(1);

    act(() => {
      const input = container.querySelector<HTMLInputElement>(".forge-select__search")!;
      input.value = "x";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onSearch).toHaveBeenCalledWith("x");

    act(() => {
      container
        .querySelector<HTMLInputElement>(".forge-select__search")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => container.querySelector<HTMLElement>(".forge-select__clear")!.click());
    expect(onClear).toHaveBeenCalledTimes(1);
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
