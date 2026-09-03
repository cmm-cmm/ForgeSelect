import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgeSelect from "../src/index";
import type { ForgeSelectPlugin } from "../src/index";

function mountSelect(html?: string): HTMLSelectElement {
  document.body.innerHTML = `
    <select id="country">
      ${
        html ??
        `<option value="vn">Vietnam</option>
         <option value="jp">Japan</option>
         <option value="us">United States</option>`
      }
    </select>`;
  return document.querySelector<HTMLSelectElement>("#country")!;
}

function optionEls(): HTMLLIElement[] {
  return Array.from(document.querySelectorAll<HTMLLIElement>(".forge-select__option"));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("reactive, search, remote, and validation APIs", () => {
  it("updates runtime options without remounting", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { placeholder: "Before" });
    const root = document.querySelector<HTMLElement>(".forge-select")!;
    select.updateOptions({ placeholder: "After", theme: "dark", disabled: true, required: true });
    expect(document.querySelector(".forge-select__placeholder")?.textContent).toBe("After");
    expect(root.dataset.theme).toBe("dark");
    expect(document.querySelector(".forge-select__control")?.getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelector(".forge-select__control")?.getAttribute("aria-required")).toBe("true");
    select.updateOptions({ disabled: false });
    select.open();
    expect(select.isDropdownOpen()).toBe(true);
  });

  it("updates every supported runtime option", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { multiple: true, data: [{ value: "a", label: "A" }] });
    const template = (option: { label: string }) => option.label;
    select.updateOptions({
      data: [{ value: "b", label: "B", meta: { code: "bee" } }],
      ajax: { request: async () => [] },
      placeholder: "Choose",
      clearable: true,
      allowCreate: true,
      sortable: true,
      closeOnSelect: true,
      maxSelections: 2.8,
      templateResult: template,
      templateSelection: template,
      filterOption: (option) => option.value === "b",
      searchFields: ["label", "meta.code"],
      tokenSearch: false,
      accentInsensitive: false,
      searchScorer: () => 1,
      highlightSearch: true,
      minSearchLength: 2.8,
      minResultsForSearch: 1.8,
      isOptionDisabled: () => false,
      virtualScroll: false,
      itemHeight: "auto",
      language: "vi",
      openOnFocus: true,
      required: true,
      theme: "dark",
    });
    expect(document.querySelector(".forge-select")?.classList.contains("forge-select--sortable")).toBe(true);
    expect(document.querySelector<HTMLInputElement>(".forge-select__search")?.getAttribute("aria-label")).toBe(
      "Tìm kiếm",
    );
    select.updateOptions({ maxSelections: undefined, itemHeight: 48, ajax: undefined, required: false });
    expect(document.querySelector(".forge-select__control")?.hasAttribute("aria-required")).toBe(false);
    select.open();
    expect(optionEls()[0].textContent).toContain("B");
  });

  it("controls the query and performs accent-insensitive token search with highlighting", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      data: [{ value: "dn", label: "Đà Nẵng", description: "Thành phố biển" }],
      highlightSearch: true,
    });
    const onSearch = vi.fn();
    select.on("search", onSearch);
    select.open();
    select.setSearchQuery("da bien");
    expect(select.getSearchQuery()).toBe("da bien");
    expect(onSearch).toHaveBeenCalledWith("da bien");
    expect(optionEls()).toHaveLength(1);
    expect(document.querySelector(".forge-select__match")?.textContent).toBe("Đà");
  });

  it("exposes mixed tree state in the rendered row", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      multiple: true,
      data: [
        {
          value: "root",
          label: "Root",
          children: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      ],
    });
    select.setValue(["a"]);
    select.open();
    expect(document.querySelector('[data-option-value="root"]')?.getAttribute("data-selection-state")).toBe("mixed");
  });

  it("provides public required and custom validation", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { required: true, data: [{ value: "a", label: "A" }] });
    const invalid = vi.fn();
    select.on("invalid", invalid);
    expect(select.validate()).toBe(false);
    expect(select.reportValidity()).toBe(false);
    expect(invalid).toHaveBeenCalled();
    select.setValue("a");
    select.setCustomValidity("Blocked");
    expect(select.validate()).toBe(false);
    select.setCustomValidity("");
    expect(select.validate()).toBe(true);
  });

  it("caches remote results and reload bypasses the cache", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => [{ value: "a", label: "A" }]);
    mountSelect("");
    const select = new ForgeSelect("#country", { ajax: { request, debounce: 0, cacheTtl: 10000 } });
    select.open();
    await vi.runAllTimersAsync();
    select.setSearchQuery("cached");
    await vi.runAllTimersAsync();
    select.setSearchQuery("other");
    await vi.runAllTimersAsync();
    select.setSearchQuery("cached");
    await vi.runAllTimersAsync();
    expect(request).toHaveBeenCalledTimes(3);
    select.reload();
    await vi.runAllTimersAsync();
    expect(request).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it("retries failed remote requests and emits loading state", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue([{ value: "a", label: "A" }]);
    mountSelect("");
    const select = new ForgeSelect("#country", { ajax: { request, retry: 1, retryDelay: 1 } });
    const loading = vi.fn();
    select.on("loading", loading);
    select.open();
    await vi.runAllTimersAsync();
    expect(request).toHaveBeenCalledTimes(2);
    expect(loading).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });
});

describe("guarded creation and data integrity", () => {
  it("does not search or activate an option while an IME composition is active", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      allowCreate: true,
      data: [{ value: "vn", label: "Việt Nam" }],
    });
    const searches = vi.fn();
    select.on("search", searches);
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input.value = "Việt";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "t", isComposing: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true }));
    expect(searches).not.toHaveBeenCalled();
    expect(select.getValue()).toBeNull();
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "Việt" }));
    expect(searches).toHaveBeenCalledWith("Việt");
  });

  it("supports selection guards and async tag creation", async () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      allowCreate: true,
      beforeSelect: (option) => option.value !== "blocked",
      beforeCreate: (label) => label !== "forbidden",
      createOption: async (label) => ({ value: label.toLowerCase(), label }),
      data: [{ value: "blocked", label: "Blocked" }],
    });
    select.open();
    optionEls()[0].click();
    expect(select.getValue()).toBeNull();
    select.setSearchQuery("Created");
    document.querySelector<HTMLLIElement>(".forge-select__option--create")?.click();
    await vi.waitFor(() => expect(select.getValue()).toBe("created"));
  });

  it("enforces beforeSelect when a multi-tag paste exactly matches a blocked existing option", async () => {
    mountSelect();
    const select = new ForgeSelect("#country", {
      multiple: true,
      allowCreate: true,
      beforeSelect: (option) => option.value !== "blocked",
      data: [{ value: "blocked", label: "Blocked" }],
    });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    const event = new Event("paste", { cancelable: true, bubbles: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "Blocked, Created" } });
    input.dispatchEvent(event);
    await vi.waitFor(() => expect(select.getValue()).toEqual(["Created"]));
  });

  it("supports prune/error missing-selection policies and duplicate detection", () => {
    mountSelect("");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const select = new ForgeSelect("#country", {
      multiple: true,
      missingSelectionPolicy: "prune",
      data: [
        { value: "a", label: "A" },
        { value: "a", label: "Duplicate A" },
        { value: "b", label: "B" },
      ],
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("duplicate option value"));
    select.setValue(["a", "b"]);
    select.setData([{ value: "b", label: "B" }]);
    expect(select.getValue()).toEqual(["b"]);
    select.updateOptions({ missingSelectionPolicy: "error" });
    expect(() => select.setData([])).toThrow(/missing selected value/);
    expect(select.getValue()).toEqual(["b"]);
    warn.mockRestore();
  });

  it("honors a synchronous createOption returning undefined to cancel creation", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      allowCreate: true,
      createOption: (label) => (label.includes("@") ? undefined : { value: label, label }),
      data: [],
    });
    select.open();
    select.setSearchQuery("bad@label");
    document.querySelector<HTMLLIElement>(".forge-select__option--create")?.click();
    expect(select.getValue()).toBeNull();

    select.setSearchQuery("good");
    document.querySelector<HTMLLIElement>(".forge-select__option--create")?.click();
    expect(select.getValue()).toBe("good");
  });

  it("applies every option in one updateOptions() call before duplicateValuePolicy: error throws", () => {
    mountSelect("");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const select = new ForgeSelect("#country", {
      data: [
        { value: "a", label: "A" },
        { value: "a", label: "A2" },
      ],
    });
    // itemHeight is applied later than duplicateValuePolicy in updateOptions()'s
    // field order, so this only passes if validation is deferred until every
    // other field in the call has already landed.
    expect(() => select.updateOptions({ duplicateValuePolicy: "error", itemHeight: 50 })).toThrow(
      /duplicate option value/,
    );
    expect(document.querySelector<HTMLElement>(".forge-select")?.style.getPropertyValue("--fs-item-height")).toBe(
      "50px",
    );
    warn.mockRestore();
  });

  it("does not cancel a pending remote request when setData() is rejected by missingSelectionPolicy: error", async () => {
    const request = vi.fn().mockResolvedValue([{ value: "z", label: "Z" }]);
    mountSelect("");
    const select = new ForgeSelect("#country", {
      missingSelectionPolicy: "error",
      data: [{ value: "a", label: "A" }],
      ajax: { request, debounce: 0 },
    });
    select.setValue("a");
    select.open();
    select.setSearchQuery("q");
    expect(() => select.setData([{ value: "b", label: "B" }])).toThrow(/missing selected value/);
    // A validation failure must not silently cancel the load scheduled just
    // before it — the caller has no way to detect or retry a cancelled load.
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
  });

  it("sanitizes string templates", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      data: [{ value: "a", label: "A" }],
      templateResult: () => '<img src="x" onerror="alert(1)"><strong>Safe</strong>',
      sanitizeTemplate: (html) => html.replace(/\sonerror="[^"]*"/, ""),
    });
    select.open();
    expect(document.querySelector(".forge-select__option img")?.hasAttribute("onerror")).toBe(false);
    expect(document.querySelector(".forge-select__option strong")?.textContent).toBe("Safe");
  });
});

describe("initialization", () => {
  it("mounts from a CSS selector and hides the native select", () => {
    const el = mountSelect();
    new ForgeSelect("#country");
    expect(el.style.display).toBe("none");
    expect(document.querySelector(".forge-select")).not.toBeNull();
  });

  it("throws for a missing target", () => {
    expect(() => new ForgeSelect("#nope")).toThrow(/target element not found/);
  });

  it("shows the placeholder when nothing is selected", () => {
    mountSelect();
    new ForgeSelect("#country", { placeholder: "Pick one" });
    expect(document.querySelector(".forge-select__placeholder")?.textContent).toBe("Pick one");
  });

  it("picks up an explicitly selected native option", () => {
    mountSelect(`<option value="a">A</option><option value="b" selected>B</option>`);
    const select = new ForgeSelect("#country");
    expect(select.getValue()).toBe("b");
  });

  it("picks up a native option selected programmatically before mount", () => {
    const el = mountSelect();
    el.value = "jp";
    const select = new ForgeSelect(el);
    expect(select.getValue()).toBe("jp");
  });

  it("inherits disabled state from the native select and disabled optgroups", () => {
    const el = mountSelect(`<optgroup label="Blocked" disabled><option value="a">A</option></optgroup>`);
    el.disabled = true;
    const select = new ForgeSelect(el);
    select.open();
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")?.hidden).toBe(true);
    select.enable();
    select.open();
    expect(optionEls()[0].getAttribute("aria-disabled")).toBe("true");
  });

  it("synchronizes external native changes and form resets", async () => {
    document.body.innerHTML = `<form><select id="country"><option value="a" selected>A</option><option value="b">B</option></select></form>`;
    const el = document.querySelector<HTMLSelectElement>("#country")!;
    const select = new ForgeSelect(el);
    el.value = "b";
    el.dispatchEvent(new Event("change"));
    expect(select.getValue()).toBe("b");
    el.form!.reset();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(select.getValue()).toBe("a");
  });

  it("applies the theme attribute", () => {
    mountSelect();
    new ForgeSelect("#country", { theme: "dark" });
    expect(document.querySelector<HTMLElement>(".forge-select")?.dataset.theme).toBe("dark");
  });

  it("forwards a <label for> association on the original select to the new control", () => {
    document.body.innerHTML = `<label for="country">Country</label><select id="country"><option value="vn">Vietnam</option></select>`;
    new ForgeSelect("#country");
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    const labelledby = control.getAttribute("aria-labelledby");
    expect(labelledby).toBeTruthy();
    expect(document.getElementById(labelledby!)?.textContent).toBe("Country");
  });

  it("forwards aria-label / aria-labelledby set directly on the target element", () => {
    mountSelect();
    document.querySelector("#country")!.setAttribute("aria-label", "Pick a country");
    new ForgeSelect("#country");
    expect(document.querySelector(".forge-select__control")?.getAttribute("aria-label")).toBe("Pick a country");
  });
});

describe("open/close and events", () => {
  it("opens on control click and emits open/close", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    const opened = vi.fn();
    const closed = vi.fn();
    select.on("open", opened);
    select.on("close", closed);

    document.querySelector<HTMLElement>(".forge-select__control")!.click();
    expect(opened).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(false);

    select.close();
    expect(closed).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(true);
  });

  it("supports off()", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    const handler = vi.fn();
    select.on("open", handler);
    select.off("open", handler);
    select.open();
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple handlers for the same event", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    const first = vi.fn();
    const second = vi.fn();
    select.on("open", first);
    select.on("open", second);
    select.open();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    select.off("open", first);
    select.close();
    select.open();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
  });
});

describe("openOnFocus", () => {
  it("does not open on focus alone by default", () => {
    mountSelect();
    new ForgeSelect("#country");
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    control.dispatchEvent(new FocusEvent("focus"));
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(true);
  });

  it("opens the dropdown when focused via keyboard (no preceding mousedown)", () => {
    mountSelect();
    new ForgeSelect("#country", { openOnFocus: true });
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    control.dispatchEvent(new FocusEvent("focus"));
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(false);
  });

  it("does not double-toggle on a full mouse click (mousedown -> focus -> click)", () => {
    mountSelect();
    new ForgeSelect("#country", { openOnFocus: true });
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    control.dispatchEvent(new FocusEvent("focus"));
    control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(false);
  });
});

describe("selection", () => {
  it("selects an option on click, closes, and emits change", () => {
    const el = mountSelect();
    const select = new ForgeSelect("#country");
    const changed = vi.fn();
    select.on("change", changed);

    select.open();
    optionEls()[1].click();

    expect(select.getValue()).toBe("jp");
    expect(changed).toHaveBeenCalledWith("jp");
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(true);
    expect(el.value).toBe("jp");
    expect(document.querySelector(".forge-select__single-value")?.textContent).toBe("Japan");
  });

  it("re-renders only visible rows on a plain selection, without re-invoking filterOption", () => {
    mountSelect(`<option value="a">A</option><option value="b">B</option>`);
    const filterOption = vi.fn(() => true);
    const select = new ForgeSelect("#country", { multiple: true, filterOption });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "x";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const callsAfterSearch = filterOption.mock.calls.length;
    expect(callsAfterSearch).toBeGreaterThan(0);

    optionEls()[0].click();

    // A plain (non-capped) selection doesn't change which rows match the
    // current search, so it must not re-scan the dataset via filterOption.
    expect(filterOption.mock.calls.length).toBe(callsAfterSearch);
    expect(select.getValue()).toEqual(["a"]);
  });

  it("setValue/getValue round-trips and syncs the native select", () => {
    const el = mountSelect();
    const select = new ForgeSelect("#country");
    select.setValue("us");
    expect(select.getValue()).toBe("us");
    expect(el.value).toBe("us");
  });

  it("setValue with the same value does not re-emit change", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    const changed = vi.fn();
    select.setValue("vn");
    select.on("change", changed);
    select.setValue("vn");
    expect(changed).not.toHaveBeenCalled();
  });

  it("can set a value without emitting the Forge Select change event", () => {
    const el = mountSelect();
    const select = new ForgeSelect("#country");
    const changed = vi.fn();
    const nativeChanged = vi.fn();
    select.on("change", changed);
    el.addEventListener("change", nativeChanged);
    select.setValue("jp", { emitChange: false });
    expect(select.getValue()).toBe("jp");
    expect(el.value).toBe("jp");
    expect(changed).not.toHaveBeenCalled();
    expect(nativeChanged).not.toHaveBeenCalled();
  });

  it("collapses selections past maxVisibleTags into one counter chip", () => {
    mountSelect("");
    const tags = () => Array.from(document.querySelectorAll(".forge-select__tag"), (t) => t.textContent);
    const overflow = () => document.querySelector(".forge-select__tag-overflow")?.textContent ?? null;
    const select = new ForgeSelect("#country", {
      multiple: true,
      maxVisibleTags: 2,
      data: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
        { value: "c", label: "C" },
        { value: "d", label: "D" },
      ],
    });

    // At the cap every selection still gets its own tag and nothing is counted.
    select.setValue(["a", "b"]);
    expect(tags()).toHaveLength(2);
    expect(overflow()).toBeNull();

    // Past it the control stays the same size: the cap in tags, then a count
    // of what is not shown.
    select.setValue(["a", "b", "c", "d"]);
    expect(tags().map((t) => t?.replace("×", ""))).toEqual(["A", "B"]);
    expect(overflow()).toBe("+2 more");
    // The value itself is untouched — only the rendering is capped.
    expect(select.getValue()).toEqual(["a", "b", "c", "d"]);

    // Raising the cap past the selection renders all of them again.
    select.updateOptions({ maxVisibleTags: 10 });
    expect(tags()).toHaveLength(4);
    expect(overflow()).toBeNull();
  });

  it("renders every tag when maxVisibleTags is unset, and localizes the counter", () => {
    mountSelect("");
    const data = Array.from({ length: 5 }, (_, i) => ({ value: String(i), label: `Item ${i}` }));

    // Unset is the default, so an existing multiple select renders as before.
    const uncapped = new ForgeSelect("#country", { multiple: true, data });
    uncapped.setValue(["0", "1", "2", "3", "4"]);
    expect(document.querySelectorAll(".forge-select__tag")).toHaveLength(5);
    expect(document.querySelector(".forge-select__tag-overflow")).toBeNull();
    uncapped.destroy();

    mountSelect("");
    const vietnamese = new ForgeSelect("#country", {
      multiple: true,
      maxVisibleTags: 1,
      language: "vi",
      data,
    });
    vietnamese.setValue(["0", "1", "2"]);
    expect(document.querySelector(".forge-select__tag-overflow")?.textContent).toBe("+2 nữa");
    vietnamese.destroy();
  });

  it("ignores maxVisibleTags for a single select", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      maxVisibleTags: 0,
      data: [{ value: "a", label: "A" }],
    });
    select.setValue("a");
    // A single select renders one value, not tags, so the cap has nothing to
    // apply to and must not blank the control.
    expect(document.querySelector(".forge-select__single-value")?.textContent).toBe("A");
    expect(document.querySelector(".forge-select__tag-overflow")).toBeNull();
  });

  it("toggles values in multiple mode and renders tags", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true });
    select.open();
    optionEls()[0].click();
    optionEls()[1].click();
    expect(select.getValue()).toEqual(["vn", "jp"]);
    expect(document.querySelectorAll(".forge-select__tag")).toHaveLength(2);

    // clicking a selected option deselects it
    optionEls()[0].click();
    expect(select.getValue()).toEqual(["jp"]);
  });

  it("removes a tag via its remove button", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true });
    select.setValue(["vn", "jp"]);
    document.querySelector<HTMLElement>(".forge-select__tag-remove")!.click();
    expect(select.getValue()).toEqual(["jp"]);
  });

  it("clears the selection via the clear button and emits clear", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { clearable: true });
    const cleared = vi.fn();
    select.on("clear", cleared);
    select.setValue("vn");

    const clearBtn = document.querySelector<HTMLButtonElement>(".forge-select__clear")!;
    expect(clearBtn.hidden).toBe(false);
    clearBtn.click();

    expect(cleared).toHaveBeenCalledOnce();
    expect(select.getValue()).toBeNull();
  });
});

describe("closeOnSelect and maxSelections", () => {
  it("leaves the dropdown open after a pick by default", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true });
    select.open();
    optionEls()[0].click();
    expect(select.getValue()).toEqual(["vn"]);
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(false);
  });

  it("closes the dropdown after each pick when closeOnSelect is true", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, closeOnSelect: true });
    select.open();
    optionEls()[0].click();
    expect(select.getValue()).toEqual(["vn"]);
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(true);

    select.open();
    optionEls()[0].click();
    expect(select.getValue()).toEqual([]);
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(true);
  });

  it("ignores further selections once maxSelections is reached, but allows removing a tag first", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, maxSelections: 2 });
    select.open();
    optionEls()[0].click();
    optionEls()[1].click();
    optionEls()[2].click();
    expect(select.getValue()).toEqual(["vn", "jp"]);

    document.querySelector<HTMLElement>(".forge-select__tag-remove")!.click();
    select.open();
    optionEls()[2].click();
    expect(select.getValue()).toEqual(["jp", "us"]);
  });

  it("re-scans the dataset when crossing maxSelections changes which rows are selectable", () => {
    mountSelect(`<option value="a">A</option><option value="b">B</option>`);
    const filterOption = vi.fn(() => true);
    const select = new ForgeSelect("#country", { multiple: true, maxSelections: 1, filterOption });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "x";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const callsAfterSearch = filterOption.mock.calls.length;

    optionEls()[0].click(); // reaches the cap of 1

    // Crossing maxSelections changes which rows are interactable/navigable,
    // so navItems must be rebuilt via a full buildRows() re-scan.
    expect(filterOption.mock.calls.length).toBeGreaterThan(callsAfterSearch);
    expect(select.getValue()).toEqual(["a"]);
  });

  it("drops unselected options out of keyboard navigation once maxSelections is reached", () => {
    mountSelect(`<option value="a">A</option><option value="b">B</option><option value="c">C</option>`);
    const select = new ForgeSelect("#country", { multiple: true, maxSelections: 2 });
    select.setValue(["a", "b"]);
    select.open();

    // At the cap only the already-selected rows stay navigable, so ArrowUp —
    // which wraps to the *last* navigable row — must land on B. If C were left
    // in the nav list it would take that slot while still rendering disabled,
    // leaving the highlight on a row the user cannot see.
    const search = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    const highlighted = document.querySelectorAll(".forge-select__option--highlighted");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent?.trim()).toBe("B");

    const cRow = optionEls().find((li) => li.textContent?.trim() === "C")!;
    cRow.click();
    expect(select.getValue()).toEqual(["a", "b"]);
  });

  it("blocks creating a new tag via allowCreate once maxSelections is reached", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, allowCreate: true, maxSelections: 1 });
    select.setValue(["vn"]);
    select.open();
    const search = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    search.value = "brand new";
    search.dispatchEvent(new Event("input"));
    const createRow = document.querySelector<HTMLElement>(".forge-select__option--create");
    createRow?.click();
    expect(select.getValue()).toEqual(["vn"]);
  });

  it("does not exceed maxSelections when a tree node cascades to descendants", () => {
    mountSelect();
    const select = new ForgeSelect("#country", {
      multiple: true,
      maxSelections: 2,
      data: [
        {
          value: "parent",
          label: "Parent",
          children: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      ],
    });
    select.open();
    optionEls()[0].click();
    expect(select.getValue()).toEqual([]);
  });

  it("keeps the dropdown open when maxSelections rejects a pick", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, closeOnSelect: true, maxSelections: 1 });
    select.setValue(["vn"]);
    select.open();
    optionEls()[1].click();
    expect(select.getValue()).toEqual(["vn"]);
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(false);
  });

  it("closes after allowCreate creates a tag when closeOnSelect is true", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, allowCreate: true, closeOnSelect: true });
    select.open();
    const search = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    search.value = "brand new";
    search.dispatchEvent(new Event("input"));
    document.querySelector<HTMLElement>(".forge-select__option--create")!.click();
    expect(select.getValue()).toEqual(["brand new"]);
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(true);
  });
});

describe("selectAll and clearAll", () => {
  it("selects every option in a flat multi-select list", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true });
    select.selectAll();
    expect(select.getValue()).toEqual(["vn", "jp", "us"]);
  });

  it("is a no-op on single-select", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    select.selectAll();
    expect(select.getValue()).toBeNull();
  });

  it("skips a disabled descendant and marks the parent indeterminate rather than all", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      multiple: true,
      data: [
        {
          value: "fruits",
          label: "Fruits",
          children: [
            { value: "apple", label: "Apple" },
            { value: "banana", label: "Banana", disabled: true },
          ],
        },
      ],
    });
    select.selectAll();
    expect(select.getValue()).toEqual(["fruits", "apple"]);
  });

  it("stops at the maxSelections cap", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, maxSelections: 2 });
    select.selectAll();
    expect(select.getValue()).toHaveLength(2);
  });

  it("clearAll empties the value and emits change", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true });
    select.setValue(["vn", "jp"]);
    const changed = vi.fn();
    select.on("change", changed);
    select.clearAll();
    expect(select.getValue()).toEqual([]);
    expect(changed).toHaveBeenCalledWith([]);
  });
});

describe("setData", () => {
  it("replaces the option list; opening afterward shows only the new data", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    select.setData([{ value: "x", label: "Xylophone" }]);
    select.open();
    expect(optionEls()).toHaveLength(1);
    expect(optionEls()[0].textContent).toContain("Xylophone");
  });

  it("re-renders an already-open dropdown immediately", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    select.open();
    expect(optionEls()).toHaveLength(3);
    select.setData([{ value: "x", label: "Xylophone" }]);
    expect(optionEls()).toHaveLength(1);
  });

  it("keeps a selection whose value is no longer in the new data", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    select.setValue("jp");
    select.setData([{ value: "x", label: "Xylophone" }]);
    expect(select.getValue()).toBe("jp");
    expect(document.querySelector(".forge-select__single-value")?.textContent).toBe("Japan");
  });

  it("does not emit change or open a closed dropdown", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    const changed = vi.fn();
    select.on("change", changed);
    select.setData([{ value: "x", label: "Xylophone" }]);
    expect(changed).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(true);
  });

  it("prevents a pending ajax response from overwriting manually supplied data", async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    mountSelect();
    const select = new ForgeSelect("#country", { ajax: { url: "/api", debounce: 0 } });
    select.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();

    select.setData([{ value: "manual", label: "Manual" }]);
    resolveFetch({ ok: true, json: async () => [{ value: "remote", label: "Remote" }] });
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(optionEls().map((option) => option.textContent)).toEqual(["Manual"]);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("treats setData as loaded data instead of fetching on the next open", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mountSelect();
    const select = new ForgeSelect("#country", { ajax: { url: "/api", debounce: 0 } });
    select.setData([{ value: "manual", label: "Manual" }]);
    select.open();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(optionEls().map((option) => option.textContent)).toEqual(["Manual"]);
    vi.unstubAllGlobals();
  });

  it("clears the measured row-height cache so offset math doesn't use a stale height after setData()", async () => {
    mountSelect("");
    let firstRowHeight = 20;
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const height = this.dataset?.optionValue === "0" ? firstRowHeight : 36;
      return { height, top: 0, bottom: height, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });

    const bigData = Array.from({ length: 300 }, (_, i) => ({ value: String(i), label: `Item ${i}` }));
    const select = new ForgeSelect("#country", { itemHeight: "auto", data: bigData });
    select.open(); // Row "0" renders near the top and is measured/cached at 20px.

    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    Object.defineProperty(list, "clientHeight", { value: 260, configurable: true });
    Object.defineProperty(list, "scrollTop", { value: 5000, configurable: true, writable: true });
    list.dispatchEvent(new Event("scroll")); // Row "0" scrolls out of the rendered window.
    await new Promise((r) => requestAnimationFrame(r));

    firstRowHeight = 36; // Row "0"'s real height is now like everything else...
    select.setData(bigData); // ...but it stays off-screen, so it's never re-measured here.

    const spacerHeight = parseInt(document.querySelector<HTMLElement>(".forge-select__spacer")!.style.height);
    // Every rendered or default-fallback row is 36px. A leftover stale 20px
    // cache entry for row "0" (included in the top spacer's prefix sum, since
    // it's before the current window) would make the total 16px short of a
    // clean multiple of 36 — it must fall back to the default instead.
    expect(spacerHeight % 36).toBe(0);

    getBoundingClientRect.mockRestore();
  });
});

describe("sortable tags (drag & drop ordering)", () => {
  function pointerEvent(
    type: string,
    clientX: number,
    opts: Partial<{ pointerId: number; button: number }> = {},
  ): PointerEvent {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX, pointerId: opts.pointerId ?? 1, button: opts.button ?? 0 });
    return event as unknown as PointerEvent;
  }

  /** jsdom has no real layout, so stub each tag's rect by its intended left offset. */
  function stubTagRects(lefts: number[]): HTMLElement[] {
    const tags = Array.from(document.querySelectorAll<HTMLElement>(".forge-select__tag"));
    tags.forEach((tag, i) => {
      tag.getBoundingClientRect = () =>
        ({
          left: lefts[i],
          right: lefts[i] + 50,
          width: 50,
          height: 20,
          top: 0,
          bottom: 20,
          x: lefts[i],
          y: 0,
          toJSON() {},
        }) as DOMRect;
    });
    return tags;
  }

  it("reorders tags via pointer drag and emits change exactly once", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, sortable: true });
    select.setValue(["vn", "jp", "us"]);
    const changed = vi.fn();
    select.on("change", changed);

    const tags = stubTagRects([0, 60, 120]); // midpoints: 25, 85, 145
    tags[0].dispatchEvent(pointerEvent("pointerdown", 10));
    tags[0].dispatchEvent(pointerEvent("pointermove", 90)); // past jp's midpoint
    tags[0].dispatchEvent(pointerEvent("pointerup", 90));

    expect(select.getValue()).toEqual(["jp", "vn", "us"]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("ignores small movements so a plain tag click still passes through", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, sortable: true });
    select.setValue(["vn", "jp"]);
    const changed = vi.fn();
    select.on("change", changed);

    const tags = stubTagRects([0, 60]);
    tags[0].dispatchEvent(pointerEvent("pointerdown", 10));
    tags[0].dispatchEvent(pointerEvent("pointermove", 11)); // below the drag threshold
    tags[0].dispatchEvent(pointerEvent("pointerup", 11));

    expect(select.getValue()).toEqual(["vn", "jp"]);
    expect(changed).not.toHaveBeenCalled();
  });

  it("reorders via Alt+ArrowRight on a focused tag and refocuses it", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, sortable: true });
    select.setValue(["vn", "jp", "us"]);

    const tags = Array.from(document.querySelectorAll<HTMLElement>(".forge-select__tag"));
    tags[0].focus();
    tags[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true, cancelable: true }),
    );

    expect(select.getValue()).toEqual(["jp", "vn", "us"]);
    expect((document.activeElement as HTMLElement | null)?.dataset.value).toBe("vn");
  });

  it("leaves default multiple-select tags unchanged when sortable is not set", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true });
    select.setValue(["vn", "jp"]);
    const tag = document.querySelector<HTMLElement>(".forge-select__tag")!;
    expect(tag.hasAttribute("tabindex")).toBe(false);
    expect(tag.dataset.value).toBeUndefined();
  });

  it("reorders the native <select>'s option elements to match the dragged order", () => {
    const el = mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, sortable: true });
    select.setValue(["vn", "jp", "us"]);

    const tags = stubTagRects([0, 60, 120]);
    tags[0].dispatchEvent(pointerEvent("pointerdown", 10));
    tags[0].dispatchEvent(pointerEvent("pointermove", 90));
    tags[0].dispatchEvent(pointerEvent("pointerup", 90));

    const value = select.getValue() as string[];
    const order = Array.from(el.options)
      .map((o) => o.value)
      .filter((v) => value.includes(v));
    expect(order).toEqual(value);
  });
});

describe("search", () => {
  it("filters options and emits search", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    const searched = vi.fn();
    select.on("search", searched);
    select.open();

    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "jap";
    input.dispatchEvent(new Event("input"));

    expect(searched).toHaveBeenCalledWith("jap");
    const labels = optionEls().map((li) => li.textContent);
    expect(labels).toEqual(["Japan"]);
  });

  it("shows an empty state when nothing matches", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelector(".forge-select__empty")).not.toBeNull();
    expect(document.querySelector(".forge-select__sr-only")?.textContent).toBe("No results found");
  });
});

describe("filterOption and minSearchLength", () => {
  it("uses a custom match predicate instead of the built-in label/description match", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      data: [
        { value: "a", label: "Alpha", meta: { tag: "fruit" } },
        { value: "b", label: "Beta", meta: { tag: "veg" } },
      ],
      filterOption: (option, query) => option.meta?.tag === query,
    });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "fruit";
    input.dispatchEvent(new Event("input"));
    expect(optionEls().map((li) => li.textContent)).toEqual(["Alpha"]);
  });

  it("shows a hint row and skips filtering below minSearchLength", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { minSearchLength: 3 });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "ja";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelector(".forge-select__min-length")?.textContent).toBe(
      "Type 3 or more characters to search",
    );
    expect(document.querySelector(".forge-select__sr-only")?.textContent).toBe("Type 3 or more characters to search");

    input.value = "jap";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelector(".forge-select__min-length")).toBeNull();
    expect(optionEls().map((li) => li.textContent)).toEqual(["Japan"]);
  });

  it("does not call ajax below minSearchLength, and aborts an in-flight request when backing under it", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    mountSelect("");
    new ForgeSelect("#country", {
      minSearchLength: 3,
      ajax: { url: "/api", debounce: 0 },
    });
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    document.querySelector<HTMLElement>(".forge-select__control")!.click();

    input.value = "ja";
    input.dispatchEvent(new Event("input"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();

    input.value = "jap";
    input.dispatchEvent(new Event("input"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();

    input.value = "ja";
    input.dispatchEvent(new Event("input"));
    expect(aborted).toBe(true);

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});

describe("allowCreate (tags mode)", () => {
  // The label index behind exact-match detection is filled on demand, so the
  // paths that replace or re-normalize `data` have to invalidate it or the
  // create row is decided against options that are no longer there.
  it("re-derives exact-match detection after setData replaces the options", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      multiple: true,
      allowCreate: true,
      data: [{ value: "vn", label: "Vietnam" }],
    });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    const type = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };
    const createRow = () => document.querySelector(".forge-select__option--create");

    type("Vietnam");
    expect(createRow()).toBeNull();

    select.setData([{ value: "jp", label: "Japan" }]);
    type("Vietnam");
    expect(createRow()).not.toBeNull();
    type("Japan");
    expect(createRow()).toBeNull();
  });

  it("re-derives exact-match detection when accentInsensitive is switched off", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      multiple: true,
      allowCreate: true,
      data: [{ value: "dn", label: "Đà Nẵng" }],
    });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    const type = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };

    // Accent-insensitive by default: the stripped spelling counts as a match.
    type("Da Nang");
    expect(document.querySelector(".forge-select__option--create")).toBeNull();

    select.updateOptions({ accentInsensitive: false });
    type("Da Nang");
    expect(document.querySelector(".forge-select__option--create")).not.toBeNull();
    type("Đà Nẵng");
    expect(document.querySelector(".forge-select__option--create")).toBeNull();
  });

  it("creates a new option from the query", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, allowCreate: true });
    select.open();

    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "Wakanda";
    input.dispatchEvent(new Event("input"));

    const createRow = document.querySelector<HTMLElement>(".forge-select__option--create")!;
    expect(createRow.textContent).toContain("Wakanda");
    createRow.click();

    expect(select.getValue()).toEqual(["Wakanda"]);
    expect(document.querySelector(".forge-select__option--create")).toBeNull();
    expect(optionEls().some((option) => option.textContent?.includes("Wakanda"))).toBe(true);
  });
});

describe("paste-splitting tags", () => {
  function pasteText(input: HTMLInputElement, text: string): void {
    const event = new Event("paste", { cancelable: true, bubbles: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
    input.dispatchEvent(event);
  }

  it("splits a comma-separated paste into multiple tags", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, allowCreate: true });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    pasteText(input, "a, b, c");
    expect(select.getValue()).toEqual(["a", "b", "c"]);
  });

  it("splits newline-separated values too", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, allowCreate: true });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    pasteText(input, "a\nb");
    expect(select.getValue()).toEqual(["a", "b"]);
  });

  it("does not intercept a single pasted value", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, allowCreate: true });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    const event = new Event("paste", { cancelable: true, bubbles: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "solo" } });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(select.getValue()).toEqual([]);
  });

  it("selects an existing option instead of creating a duplicate when the label matches exactly", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      multiple: true,
      allowCreate: true,
      data: [{ value: "vn", label: "Vietnam" }],
    });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    pasteText(input, "Vietnam, Laos");
    expect(select.getValue()).toEqual(["vn", "Laos"]);
  });

  it("respects maxSelections mid-paste", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, allowCreate: true, maxSelections: 2 });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    pasteText(input, "a, b, c");
    expect(select.getValue()).toEqual(["a", "b"]);
  });
});

describe("option groups", () => {
  it("renders group labels from data", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      data: [
        { label: "Asia", options: [{ value: "vn", label: "Vietnam" }] },
        { label: "Americas", options: [{ value: "us", label: "United States" }] },
      ],
    });
    select.open();
    const groups = Array.from(document.querySelectorAll(".forge-select__group-label")).map((el) => el.textContent);
    expect(groups).toEqual(["Asia", "Americas"]);
  });
});

describe("tree select", () => {
  function optionLabel(li: HTMLLIElement): string {
    const clone = li.cloneNode(true) as HTMLElement;
    clone.querySelector(".forge-select__twisty")?.remove();
    return clone.textContent?.trim() ?? "";
  }

  const treeData = () => [
    {
      value: "fruits",
      label: "Fruits",
      children: [
        { value: "apple", label: "Apple" },
        { value: "banana", label: "Banana" },
      ],
    },
    {
      value: "veggies",
      label: "Vegetables",
      children: [
        { value: "carrot", label: "Carrot" },
        { value: "potato", label: "Potato" },
      ],
    },
  ];

  it("renders only top-level nodes collapsed by default", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: treeData() });
    select.open();
    expect(optionEls().map(optionLabel)).toEqual(expect.arrayContaining(["Fruits", "Vegetables"]));
    expect(optionEls()).toHaveLength(2);
  });

  it("expands a node to reveal its children when the twisty is clicked", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: treeData() });
    select.open();

    document.querySelector<HTMLElement>(".forge-select__twisty")!.click();
    const labels = optionEls().map(optionLabel);
    expect(labels).toEqual(expect.arrayContaining(["Fruits", "Apple", "Banana", "Vegetables"]));
    expect(optionEls()).toHaveLength(4);

    // Toggling again collapses it back.
    document.querySelector<HTMLElement>(".forge-select__twisty")!.click();
    expect(optionEls()).toHaveLength(2);
  });

  it("exposes expansion state and navigates the tree with ArrowRight/ArrowLeft", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: treeData() });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(optionEls()[0].getAttribute("aria-expanded")).toBe("false");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(optionEls()[0].getAttribute("aria-expanded")).toBe("true");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.querySelector(".forge-select__option--highlighted")?.textContent).toContain("Apple");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.querySelector(".forge-select__option--highlighted")?.textContent).toContain("Fruits");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(optionEls()).toHaveLength(2);
  });

  it("shows matching descendants while searching and restores prior collapsed state after clearing the query", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: treeData() });
    select.open();

    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "apple";
    input.dispatchEvent(new Event("input"));

    const labels = optionEls().map(optionLabel);
    expect(labels).toEqual(expect.arrayContaining(["Fruits", "Apple"]));
    expect(labels).not.toContain("Vegetables");

    input.value = "";
    input.dispatchEvent(new Event("input"));

    // The auto-expansion during search was ephemeral: back to collapsed.
    expect(optionEls()).toHaveLength(2);
  });

  it("cascades selecting a parent to all its children in multiple mode", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { multiple: true, data: treeData() });
    select.open();

    const fruitsLi = optionEls().find((li) => li.textContent?.includes("Fruits"))!;
    fruitsLi.click();

    expect(select.getValue()).toEqual(["fruits", "apple", "banana"]);
  });

  it("shows the indeterminate class when only some descendants are selected", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { multiple: true, data: treeData() });
    select.open();

    document.querySelector<HTMLElement>(".forge-select__twisty")!.click();
    const appleLi = optionEls().find((li) => li.textContent?.includes("Apple"))!;
    appleLi.click();

    const fruitsLi = optionEls().find((li) => li.textContent?.includes("Fruits"))!;
    expect(fruitsLi.classList.contains("forge-select__option--indeterminate")).toBe(true);
    expect(fruitsLi.classList.contains("forge-select__option--selected")).toBe(false);
    expect(select.getValue()).toEqual(["apple"]);
  });

  it("un-checks the parent (not just indeterminate) when a leaf is deselected after a full cascade select", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { multiple: true, data: treeData() });
    select.open();

    // Select "Fruits" -> cascades to Apple + Banana too.
    const fruitsLi = optionEls().find((li) => li.textContent?.includes("Fruits"))!;
    fruitsLi.click();
    expect(select.getValue()).toEqual(["fruits", "apple", "banana"]);

    document.querySelector<HTMLElement>(".forge-select__twisty")!.click();
    const bananaLi = optionEls().find((li) => li.textContent?.includes("Banana"))!;
    bananaLi.click();

    // Fruits must not be both "selected" and "indeterminate" at once.
    const fruitsLiAfter = optionEls().find((li) => li.textContent?.includes("Fruits"))!;
    expect(fruitsLiAfter.classList.contains("forge-select__option--selected")).toBe(false);
    expect(fruitsLiAfter.classList.contains("forge-select__option--indeterminate")).toBe(true);
    expect(select.getValue()).toEqual(["apple"]);
  });

  it("surfaces an ancestor whose descendant matches, and hides branches that match nothing", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: treeData() });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "carrot";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // "Vegetables" matches nothing itself; it is visible only because Carrot
    // below it does. Fruits has no matching descendant and drops out entirely.
    expect(optionEls().map(optionLabel)).toEqual(["Vegetables", "Carrot"]);
  });

  it("re-derives whether the dataset is nested when setData swaps a flat list for a tree", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      data: [
        { value: "carrot", label: "Carrot" },
        { value: "apple", label: "Apple" },
      ],
    });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "carrot";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(optionEls().map(optionLabel)).toEqual(["Carrot"]);

    // The flat dataset needs no subtree bookkeeping; the tree that replaces it
    // does, so searching must still walk descendants to surface an ancestor.
    select.setData(treeData());
    input.value = "carrot";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(optionEls().map(optionLabel)).toEqual(["Vegetables", "Carrot"]);
  });

  it("does not cascade selection onto a disabled descendant", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      multiple: true,
      data: [
        {
          value: "fruits",
          label: "Fruits",
          children: [
            { value: "apple", label: "Apple" },
            { value: "banana", label: "Banana", disabled: true },
          ],
        },
      ],
    });
    select.open();

    const fruitsLi = optionEls().find((li) => li.textContent?.includes("Fruits"))!;
    fruitsLi.click();

    // Banana is disabled and excluded from navItems, so it can never be
    // un-toggled by the user — it must not be swept into `selected` either.
    expect(select.getValue()).toEqual(["fruits", "apple"]);

    document.querySelector<HTMLElement>(".forge-select__twisty")!.click();
    const appleLi = optionEls().find((li) => li.textContent?.includes("Apple"))!;
    appleLi.click();
    expect(select.getValue()).toEqual([]);
  });
});

describe("isOptionDisabled and className", () => {
  it("prevents selecting a dynamically-disabled option and skips it in keyboard nav", () => {
    mountSelect();
    const select = new ForgeSelect("#country", {
      isOptionDisabled: (option) => option.value === "jp",
    });
    select.open();

    const jpLi = optionEls().find((li) => li.textContent === "Japan")!;
    expect(jpLi.classList.contains("forge-select__option--disabled")).toBe(true);
    jpLi.click();
    expect(select.getValue()).toBeNull();

    const search = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.querySelector(".forge-select__option--highlighted")?.textContent).toBe("Vietnam");
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    // Japan is skipped entirely (excluded from nav items), landing straight on United States.
    expect(document.querySelector(".forge-select__option--highlighted")?.textContent).toBe("United States");
  });

  it("does not cascade-select a dynamically-disabled tree descendant", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      multiple: true,
      isOptionDisabled: (option) => option.value === "banana",
      data: [
        {
          value: "fruits",
          label: "Fruits",
          children: [
            { value: "apple", label: "Apple" },
            { value: "banana", label: "Banana" },
          ],
        },
      ],
    });
    select.open();

    const fruitsLi = optionEls().find((li) => li.textContent?.includes("Fruits"))!;
    fruitsLi.click();
    expect(select.getValue()).toEqual(["fruits", "apple"]);
    const fruitsLiAfter = optionEls().find((li) => li.textContent?.includes("Fruits"))!;
    expect(fruitsLiAfter.classList.contains("forge-select__option--indeterminate")).toBe(false);
    expect(fruitsLiAfter.classList.contains("forge-select__option--selected")).toBe(true);
  });

  it("renders a custom className on the option's <li>", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      data: [{ value: "a", label: "A", className: "custom-row highlight" }],
    });
    select.open();
    const li = optionEls()[0];
    expect(li.classList.contains("custom-row")).toBe(true);
    expect(li.classList.contains("highlight")).toBe(true);
    expect(li.classList.contains("forge-select__option")).toBe(true);
  });
});

describe("keyboard navigation", () => {
  it("navigates with arrows and selects with Enter", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(select.getValue()).toBe("jp");
  });

  it("highlights the last option when ArrowUp is pressed before anything is highlighted", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(select.getValue()).toBe("us");
  });

  it("skips disabled options", () => {
    mountSelect(`<option value="a">A</option><option value="b" disabled>B</option><option value="c">C</option>`);
    const select = new ForgeSelect("#country");
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(select.getValue()).toBe("c");
  });

  it("closes on Escape", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    select.open();
    document
      .querySelector<HTMLInputElement>(".forge-select__search")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(true);
    expect(select.getValue()).toBeNull();
  });

  it("Home/End jump to the first and last option", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBe("us");

    select.open();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBe("vn");
  });

  it("PageDown/PageUp jump by a page, clamped at the ends", () => {
    const options = Array.from({ length: 30 }, (_, i) => `<option value="${i}">Item ${i}</option>`).join("");
    mountSelect(options);
    const select = new ForgeSelect("#country");
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBe("10");

    select.open();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBe("29"); // clamped at the last option

    select.open();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBe("0"); // clamped at the first option
  });

  it("typeahead jumps to the next option starting with the typed letter(s), cycling and resetting on a pause", () => {
    mountSelect();
    vi.useFakeTimers();
    const select = new ForgeSelect("#country", { searchable: false });
    select.open();
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;

    control.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBe("jp");

    // A pause beyond the reset window starts a fresh buffer instead of
    // appending to the previous (now-stale) one.
    vi.advanceTimersByTime(600);
    select.open();
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "u", bubbles: true }));
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBe("us");

    vi.advanceTimersByTime(600);
    select.open();
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBe("vn");
    vi.useRealTimers();
  });

  it("cycles repeated typeahead letters, matches accents, and ignores typing in the search input", () => {
    vi.useFakeTimers();
    mountSelect("");
    const select = new ForgeSelect("#country", {
      data: [
        { value: "jp", label: "Japan" },
        { value: "jo", label: "Jordan" },
        { value: "dn", label: "Đà Nẵng" },
      ],
    });
    select.open();
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBeNull();

    control.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBe("jo");

    vi.advanceTimersByTime(600);
    select.open();
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }));
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.getValue()).toBe("dn");
    vi.useRealTimers();
  });
});

describe("dropdown positioning", () => {
  function rect(top: number, bottom: number): DOMRect {
    return {
      top,
      bottom,
      left: 0,
      right: 200,
      width: 200,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON() {},
    } as DOMRect;
  }

  function stubLayout(controlRect: DOMRect, dropdownHeight: number, innerHeight = 768): HTMLElement {
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    const dropdown = document.querySelector<HTMLElement>(".forge-select__dropdown")!;
    control.getBoundingClientRect = () => controlRect;
    Object.defineProperty(dropdown, "offsetHeight", { value: dropdownHeight, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true, writable: true });
    return control;
  }

  function isFlipped(): boolean {
    return !!document.querySelector(".forge-select")?.classList.contains("forge-select--drop-up");
  }

  it("flips above the control when there isn't room below", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    stubLayout(rect(700, 730), 300);
    select.open();
    expect(isFlipped()).toBe(true);
  });

  it("leaves the dropdown below the control when there's ample room", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    stubLayout(rect(10, 40), 300);
    select.open();
    expect(isFlipped()).toBe(false);
  });

  it("recomputes the flip on window resize while open", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    const control = stubLayout(rect(700, 730), 300);
    select.open();
    expect(isFlipped()).toBe(true);

    control.getBoundingClientRect = () => rect(10, 40);
    window.dispatchEvent(new Event("resize"));
    expect(isFlipped()).toBe(false);
  });

  it("removes the drop-up class on close", () => {
    mountSelect();
    const select = new ForgeSelect("#country");
    stubLayout(rect(700, 730), 300);
    select.open();
    expect(isFlipped()).toBe(true);
    select.close();
    expect(isFlipped()).toBe(false);
  });
});

describe("enable/disable", () => {
  it("does not open while disabled and reopens after enable", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { disabled: true });
    select.open();
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(true);

    select.enable();
    select.open();
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(false);
  });
});

describe("required", () => {
  it("sets aria-required on the control", () => {
    mountSelect();
    new ForgeSelect("#country", { required: true });
    expect(document.querySelector(".forge-select__control")?.getAttribute("aria-required")).toBe("true");
  });

  it("shows invalid styling and opens the dropdown when the native select fires invalid", () => {
    const el = mountSelect();
    el.required = true;
    new ForgeSelect(el);
    el.dispatchEvent(new Event("invalid", { cancelable: true }));

    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    expect(control.classList.contains("forge-select__control--invalid")).toBe(true);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelector<HTMLElement>(".forge-select__dropdown")!.hidden).toBe(false);
  });

  it("clears invalid styling once a valid selection is made", () => {
    const el = mountSelect();
    el.required = true;
    const select = new ForgeSelect(el);
    el.dispatchEvent(new Event("invalid", { cancelable: true }));

    select.setValue("jp");

    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    expect(control.classList.contains("forge-select__control--invalid")).toBe(false);
    expect(control.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("templates", () => {
  it("uses templateResult and templateSelection", () => {
    mountSelect();
    const select = new ForgeSelect("#country", {
      templateResult: (o) => `<em>${o.label}</em>`,
      templateSelection: (o) => `[${o.label}]`,
    });
    select.open();
    expect(document.querySelector(".forge-select__option em")?.textContent).toBe("Vietnam");
    select.setValue("jp");
    expect(document.querySelector(".forge-select__single-value")?.textContent).toBe("[Japan]");
  });

  it("does not re-run templateResult when the search query changes without changing the data", () => {
    mountSelect();
    const template = vi.fn((o: { label: string }) => `<em>${o.label}</em>`);
    new ForgeSelect("#country", { templateResult: template }).open();
    const callsAfterOpen = template.mock.calls.length;
    expect(callsAfterOpen).toBeGreaterThan(0);

    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "j";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // Filtering down and clearing back re-renders from the cache; content for
    // already-seen options must not be re-built just because the query changed.
    expect(template.mock.calls.length).toBe(callsAfterOpen);
  });
});

describe("i18n", () => {
  it("uses the vi locale", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { language: "vi", data: [] });
    select.open();
    expect(document.querySelector(".forge-select__empty")?.textContent).toBe("Không tìm thấy kết quả");
  });

  it("merges a custom string table over the English defaults", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { language: { noResults: "Nothing here" }, data: [] });
    select.open();
    expect(document.querySelector(".forge-select__empty")?.textContent).toBe("Nothing here");
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    expect(input.getAttribute("aria-label")).toBe("Search");
  });
});

describe("plugins", () => {
  it("invokes lifecycle hooks", () => {
    mountSelect();
    const plugin: ForgeSelectPlugin = {
      name: "spy",
      onInit: vi.fn(),
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onDestroy: vi.fn(),
    };
    const select = new ForgeSelect("#country", { plugins: [plugin] });
    expect(plugin.onInit).toHaveBeenCalledWith(select);
    select.open();
    expect(plugin.onOpen).toHaveBeenCalledWith(select);
    select.close();
    expect(plugin.onClose).toHaveBeenCalledWith(select);
    select.destroy();
    expect(plugin.onDestroy).toHaveBeenCalledWith(select);
  });
});

describe("ajax", () => {
  it("loads remote data with debounce and transform", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ items: [{ id: "1", name: "Ada" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    mountSelect("");
    const select = new ForgeSelect("#country", {
      ajax: {
        url: (q) => `/api/users?q=${encodeURIComponent(q)}`,
        debounce: 100,
        transform: (res) =>
          (res as { items: { id: string; name: string }[] }).items.map((u) => ({
            value: u.id,
            label: u.name,
          })),
      },
    });

    select.open();
    expect(document.querySelector(".forge-select__loading")).not.toBeNull();
    expect(document.querySelector(".forge-select__sr-only")?.textContent).toBe("Loading…");

    await vi.advanceTimersByTimeAsync(150);
    expect(fetchMock).toHaveBeenCalledWith("/api/users?q=", expect.objectContaining({ signal: expect.anything() }));
    expect(optionEls().map((li) => li.textContent)).toEqual(["Ada"]);
    expect(document.querySelector(".forge-select__sr-only")?.textContent).toBe("");

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("invalidates an in-flight response as soon as a debounced query is scheduled", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      ),
    );
    mountSelect("");
    const select = new ForgeSelect("#country", { ajax: { url: "/api", debounce: 100 } });
    select.open();
    await vi.advanceTimersByTimeAsync(0);
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "new";
    input.dispatchEvent(new Event("input"));
    resolveFirst({ json: () => Promise.resolve([{ value: "old", label: "Old" }]) });
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector(".forge-select__loading")).not.toBeNull();
    select.destroy();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders and emits an error for an unsuccessful HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    mountSelect("");
    const select = new ForgeSelect("#country", { ajax: { url: "/api" } });
    const onError = vi.fn();
    select.on("error", onError);
    select.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector(".forge-select__error")?.textContent).toBe("Could not load options");
    expect(document.querySelector(".forge-select__sr-only")?.textContent).toBe("Could not load options");
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    vi.unstubAllGlobals();
  });

  it("refetches on reopen so a cleared search box never shows the previous query's page", async () => {
    mountSelect("");
    const queries: string[] = [];
    const select = new ForgeSelect("#country", {
      ajax: {
        debounce: 0,
        request: async (query: string) => {
          queries.push(query);
          return query === ""
            ? [
                { value: "a", label: "Alpha" },
                { value: "b", label: "Beta" },
                { value: "g", label: "Gamma" },
              ]
            : [{ value: "b", label: "Beta" }];
        },
      },
    });

    select.open();
    await vi.waitFor(() => expect(optionEls()).toHaveLength(3));
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "be";
    input.dispatchEvent(new Event("input"));
    await vi.waitFor(() => expect(optionEls()).toHaveLength(1));

    select.close();
    select.open();
    // close() clears the search box, so the list must match an empty query
    // again rather than staying filtered by the query the user can no longer see.
    await vi.waitFor(() => expect(optionEls()).toHaveLength(3));
    expect(input.value).toBe("");
    expect(select.getSearchQuery()).toBe("");
    // Served from the remote cache — reopening costs no extra request.
    expect(queries).toEqual(["", "be"]);
  });

  it("retires a programmatically-set query on close even without a search box (searchable: false)", async () => {
    mountSelect("");
    const queries: string[] = [];
    const select = new ForgeSelect("#country", {
      searchable: false,
      ajax: {
        debounce: 0,
        request: async (query: string) => {
          queries.push(query);
          return query === "" ? [{ value: "a", label: "Alpha" }] : [{ value: "b", label: "Beta" }];
        },
      },
    });

    select.open();
    await vi.waitFor(() => expect(optionEls()).toHaveLength(1));
    select.setSearchQuery("be");
    await vi.waitFor(() => expect(optionEls().map((li) => li.textContent)).toEqual(["Beta"]));

    select.close();
    select.open();
    // close() must clear the programmatic query the same way it clears a typed
    // one, or reopening shows the filtered page under what looks like a fresh
    // (query-less) reopen.
    await vi.waitFor(() => expect(optionEls().map((li) => li.textContent)).toEqual(["Alpha"]));
    expect(select.getSearchQuery()).toBe("");
    expect(queries).toEqual(["", "be"]);
  });

  it("ignores a filtered response that lands after the dropdown was closed", async () => {
    mountSelect("");
    let releaseFiltered: (() => void) | undefined;
    const select = new ForgeSelect("#country", {
      ajax: {
        debounce: 0,
        request: async (query: string) => {
          if (query === "")
            return [
              { value: "a", label: "Alpha" },
              { value: "b", label: "Beta" },
              { value: "g", label: "Gamma" },
            ];
          // Hold the filtered page open so it can resolve after close().
          await new Promise<void>((resolve) => (releaseFiltered = resolve));
          return [{ value: "b", label: "Beta" }];
        },
      },
    });

    select.open();
    await vi.waitFor(() => expect(optionEls()).toHaveLength(3));
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "be";
    input.dispatchEvent(new Event("input"));
    await vi.waitFor(() => expect(releaseFiltered).toBeDefined());

    select.close();
    // The in-flight request belongs to the query close() just cleared; letting
    // it apply would mark the remote loaded and suppress the empty-query reload.
    releaseFiltered!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    select.open();
    await vi.waitFor(() => expect(optionEls()).toHaveLength(3));
  });

  it("does not refetch on reopen when the search box was already empty", async () => {
    mountSelect("");
    const queries: string[] = [];
    const select = new ForgeSelect("#country", {
      ajax: {
        debounce: 0,
        cacheTtl: 0,
        request: async (query: string) => {
          queries.push(query);
          return [{ value: "a", label: "Alpha" }];
        },
      },
    });
    select.open();
    await vi.waitFor(() => expect(optionEls()).toHaveLength(1));
    select.close();
    select.open();
    await vi.waitFor(() => expect(optionEls()).toHaveLength(1));
    expect(queries).toEqual([""]);
  });

  it("drops recycled rows when a remote reload replaces the data", async () => {
    mountSelect("");
    // Both result sets place value "c" at row index 1, which is the row-recycling
    // cache key. Only the first nests it under a parent, so a row reused across
    // the reload would still carry the tree indent it no longer has.
    const select = new ForgeSelect("#country", {
      ajax: {
        debounce: 0,
        cacheTtl: 0,
        request: async (query: string) =>
          query === "a"
            ? [{ value: "p", label: "Pa", children: [{ value: "c", label: "Ca" }] }]
            : [
                { value: "x", label: "Xaa" },
                { value: "c", label: "Caa" },
              ],
      },
    });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;

    input.value = "a";
    input.dispatchEvent(new Event("input"));
    await vi.waitFor(() => expect(optionEls()).toHaveLength(2));
    const nested = optionEls()[1];
    expect(nested.dataset.optionValue).toBe("c");
    expect(nested.style.paddingLeft).not.toBe("");

    input.value = "aa";
    input.dispatchEvent(new Event("input"));
    await vi.waitFor(() => expect(optionEls()[0]?.dataset.optionValue).toBe("x"));
    const flat = optionEls()[1];
    expect(flat.dataset.optionValue).toBe("c");
    // Same value, new label: content is cached by value alone, so a surviving
    // entry would re-render the superseded "Ca".
    expect(flat.textContent).toContain("Caa");
    expect(flat.style.paddingLeft).toBe("");
    // The replaced dataset must not leave the previous render's <li> in the cache.
    expect(flat).not.toBe(nested);
  });
});

describe("ajax pagination", () => {
  type Item = { id: string; name: string };

  function transform(res: unknown) {
    const r = res as { items: Item[]; hasMore: boolean };
    return { options: r.items.map((i) => ({ value: i.id, label: i.name })), hasMore: r.hasMore };
  }

  const SECOND_PAGE: Item[] = [
    { id: "c", name: "Gamma" },
    { id: "d", name: "Delta" },
  ];

  function pagedFetchMock(secondPage: Item[] = SECOND_PAGE) {
    return vi.fn().mockImplementation((url: string) => {
      const isSecond = url.includes("page=1");
      const items: Item[] = isSecond
        ? secondPage
        : [
            { id: "a", name: "Alpha" },
            { id: "b", name: "Beta" },
          ];
      return Promise.resolve({ json: () => Promise.resolve({ items, hasMore: !isSecond }) });
    });
  }

  function mockNearBottom(list: HTMLElement): void {
    Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(list, "clientHeight", { value: 260, configurable: true });
    Object.defineProperty(list, "scrollTop", { value: 800, configurable: true, writable: true });
  }

  /** Opens the select, settles page 0, then scrolls to the bottom and settles page 1. */
  async function loadTwoPages(): Promise<ForgeSelect> {
    const select = new ForgeSelect("#country", {
      ajax: { url: "/api/items", pagination: true, params: (q, page) => ({ q, page }), transform },
    });
    select.open();
    await new Promise((r) => setTimeout(r, 0));
    expect(optionEls().map((li) => li.textContent)).toEqual(["Alpha", "Beta"]);

    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    mockNearBottom(list);
    list.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 0));
    return select;
  }

  it("appends the next page instead of replacing when scrolled near the bottom", async () => {
    const fetchMock = pagedFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    mountSelect("");

    const select = await loadTwoPages();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("page=1");
    expect(optionEls().map((li) => li.textContent)).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    select.destroy();
    vi.unstubAllGlobals();
  });

  it("drops options the next page repeats from one already loaded", async () => {
    // Overlapping pages are ordinary for offset pagination over a table being
    // written to: a row inserted before the cursor shifts everything after it
    // down, so page 2 re-sends the tail of page 1.
    vi.stubGlobal(
      "fetch",
      pagedFetchMock([
        { id: "b", name: "Beta" },
        { id: "c", name: "Gamma" },
      ]),
    );
    mountSelect("");

    const select = await loadTwoPages();

    // "Beta" arrives on both pages; it must land in the list once.
    expect(optionEls().map((li) => li.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
    select.destroy();
    vi.unstubAllGlobals();
  });

  it("passes a cursor returned by transform to the next custom request", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: "a", name: "Alpha" }], next: "cursor-2" })
      .mockResolvedValueOnce({ items: [{ id: "b", name: "Beta" }], next: null });
    mountSelect("");
    const select = new ForgeSelect("#country", {
      ajax: {
        pagination: true,
        request,
        transform: (value) => {
          const response = value as { items: Item[]; next: string | null };
          return {
            options: response.items.map((item) => ({ value: item.id, label: item.name })),
            nextCursor: response.next,
          };
        },
      },
    });

    select.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    mockNearBottom(list);
    list.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(request.mock.calls[1][3]).toBe("cursor-2");
    expect(optionEls().map((option) => option.textContent)).toEqual(["Alpha", "Beta"]);
  });

  it("does not clear the row content cache when appending a page", async () => {
    const fetchMock = pagedFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const template = vi.fn((o: { label: string }) => o.label);

    mountSelect("");
    const select = new ForgeSelect("#country", {
      templateResult: template,
      ajax: { url: "/api/items", pagination: true, params: (q, page) => ({ q, page }), transform },
    });

    select.open();
    await new Promise((r) => setTimeout(r, 0));
    const callsAfterFirstPage = template.mock.calls.length;
    expect(callsAfterFirstPage).toBe(2);

    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    mockNearBottom(list);
    list.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 0));

    // Alpha/Beta must not be re-rendered via the template; only the 2 new options do.
    expect(template.mock.calls.length).toBe(callsAfterFirstPage + 2);

    vi.unstubAllGlobals();
  });

  it("resets page state on a new search and ignores a stale next-page response", async () => {
    let resolvePage1!: (v: unknown) => void;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("page=1")) {
        return new Promise((resolve) => {
          resolvePage1 = resolve;
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ items: [{ id: "a", name: "Alpha" }], hasMore: true }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    mountSelect("");
    const select = new ForgeSelect("#country", {
      ajax: { url: "/api/items", debounce: 0, pagination: true, params: (q, page) => ({ q, page }), transform },
    });

    select.open();
    await new Promise((r) => setTimeout(r, 0));
    expect(optionEls().map((li) => li.textContent)).toEqual(["Alpha"]);

    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    mockNearBottom(list);
    list.dispatchEvent(new Event("scroll")); // triggers the page=1 request, left pending
    await new Promise((r) => requestAnimationFrame(r));

    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "x";
    input.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 0));

    // The stale page-1 response resolves only now, after a new search replaced the data.
    resolvePage1({ json: () => Promise.resolve({ items: [{ id: "c", name: "Gamma" }], hasMore: true }) });
    await new Promise((r) => setTimeout(r, 0));

    expect(optionEls().map((li) => li.textContent)).not.toContain("Gamma");

    vi.unstubAllGlobals();
  });
});

describe("rich items", () => {
  const richData = [
    {
      value: "u1",
      label: "Ana Trần",
      description: "ana@example.com",
      avatar: "data:image/svg+xml;utf8,<svg/>",
    },
    { value: "u2", label: "Bảo Lê", description: "bao@example.com" },
  ];

  it("renders avatar and description with the built-in renderer", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: richData });
    select.open();

    const first = optionEls()[0];
    const avatar = first.querySelector<HTMLImageElement>(".forge-select__option-avatar")!;
    expect(avatar.getAttribute("loading")).toBe("lazy");
    expect(first.querySelector(".forge-select__option-label")?.textContent).toBe("Ana Trần");
    expect(first.querySelector(".forge-select__option-desc")?.textContent).toBe("ana@example.com");
    // second option has no avatar
    expect(optionEls()[1].querySelector(".forge-select__option-avatar")).toBeNull();
  });

  it("escapes HTML in rich fields", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      data: [{ value: "x", label: "<b>bold</b>", description: "<script>alert(1)</script>" }],
    });
    select.open();
    const li = optionEls()[0];
    expect(li.querySelector("b")).toBeNull();
    expect(li.querySelector("script")).toBeNull();
    expect(li.querySelector(".forge-select__option-label")?.textContent).toBe("<b>bold</b>");
  });

  it("matches the description when searching", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: richData });
    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "bao@";
    input.dispatchEvent(new Event("input"));
    const labels = optionEls().map((li) => li.querySelector(".forge-select__option-label")?.textContent);
    expect(labels).toEqual(["Bảo Lê"]);
  });

  it("shows the inline avatar in the selected value", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: richData });
    select.setValue("u1");
    const single = document.querySelector(".forge-select__single-value")!;
    expect(single.querySelector(".forge-select__inline-avatar")).not.toBeNull();
    expect(single.textContent).toBe("Ana Trần");
    expect(single.querySelector(".forge-select__option-desc")).toBeNull();
  });
});

describe("virtual scrolling", () => {
  const bigData = (n: number) => Array.from({ length: n }, (_, i) => ({ value: String(i), label: `Item ${i}` }));

  it("drops aria-activedescendant when the highlight scrolls out of the rendered window", async () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { virtualScroll: true, data: bigData(1000) });
    select.open();
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    const search = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    const active = search.getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    expect(document.getElementById(active!)).not.toBeNull();

    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    list.scrollTop = 20000;
    list.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => expect(optionEls()[0]?.textContent).not.toBe("Item 0"));

    // The highlighted row is no longer rendered, so pointing at its id would
    // reference an element that does not exist.
    expect(search.getAttribute("aria-activedescendant")).toBeNull();

    // Keyboard navigation scrolls the highlight back and restores the reference.
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const restored = search.getAttribute("aria-activedescendant");
    expect(restored).toBeTruthy();
    expect(document.getElementById(restored!)).not.toBeNull();
  });

  it("renders a window with spacers for large lists", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { virtualScroll: true, data: bigData(5000) });
    select.open();

    const rendered = optionEls();
    expect(rendered.length).toBeLessThan(100);
    expect(document.querySelectorAll(".forge-select__spacer")).toHaveLength(2);
  });

  it("recycles a row element across a filter change instead of rebuilding it", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      virtualScroll: false,
      duplicateValuePolicy: "ignore",
      data: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
        { value: "g", label: "Gamma" },
      ],
    });
    select.open();
    const beta = optionEls()[1];
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;

    // "Beta" moves from row 1 to row 0. Recycling is keyed by option value, not
    // by row index, so the same element is reused at its new position.
    input.value = "bet";
    input.dispatchEvent(new Event("input"));
    expect(optionEls()).toHaveLength(1);
    expect(optionEls()[0]).toBe(beta);
    expect(optionEls()[0].textContent).toContain("Beta");
  });

  it("renders every row when two options share a value in one window", () => {
    mountSelect("");
    // duplicateValuePolicy only warns by default, so duplicates reach the
    // renderer. Both rows must appear — handing one element to both would
    // move it rather than append it, dropping a row from the list.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const select = new ForgeSelect("#country", {
      virtualScroll: false,
      data: [
        { value: "dup", label: "First" },
        { value: "dup", label: "Second" },
        { value: "other", label: "Third" },
      ],
    });
    select.open();
    const rows = optionEls();
    expect(rows).toHaveLength(3);
    expect(rows[0]).not.toBe(rows[1]);
    expect(rows.map((r) => r.textContent)).toEqual(["First", "Second", "Third"]);
    warn.mockRestore();
  });

  it("virtualizes automatically for large lists without the option", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: bigData(1000) });
    select.open();
    expect(optionEls().length).toBeLessThan(100);
    expect(document.querySelectorAll(".forge-select__spacer")).toHaveLength(2);
  });

  it("virtualScroll: false renders everything", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { virtualScroll: false, data: bigData(1000) });
    select.open();
    expect(optionEls()).toHaveLength(1000);
    expect(document.querySelectorAll(".forge-select__spacer")).toHaveLength(0);
  });

  it("honors itemHeight in spacer math", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { itemHeight: 52, data: bigData(1000) });
    select.open();
    const spacers = document.querySelectorAll<HTMLElement>(".forge-select__spacer");
    const total = parseInt(spacers[0].style.height) + parseInt(spacers[1].style.height);
    expect(total % 52).toBe(0);
    expect(total).toBeGreaterThan(52 * 900);
  });

  it("advances the window when scrolled, despite browser scrollTop clamping", async () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: bigData(1000) });
    select.open();

    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    // Emulate real-browser behavior: while the list has no children its
    // scrollHeight is 0, so scrollTop reads (and clamps to) 0.
    let stored = 0;
    Object.defineProperty(list, "scrollTop", {
      get: () => (list.childElementCount === 0 ? 0 : stored),
      set: (v: number) => {
        stored = list.childElementCount === 0 ? 0 : v;
      },
    });

    list.scrollTop = 36 * 500; // scroll to the middle
    list.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(r));

    const labels = optionEls().map((li) => li.textContent);
    expect(labels).not.toContain("Item 0");
    expect(labels).toContain("Item 500");
    // The offset survives the re-render instead of snapping back to 0.
    expect(list.scrollTop).toBe(36 * 500);
  });

  it("uses the real viewport height, not the collapsed height while the list is cleared", async () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: bigData(1000) });
    select.open();

    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    // Emulate a real browser: `.forge-select__list` has `max-height` but no
    // explicit `height`, so once its children are removed (`textContent = ""`)
    // it collapses to just its padding instead of the real box height.
    Object.defineProperty(list, "clientHeight", {
      get: () => (list.childElementCount === 0 ? 8 : 260),
    });

    list.scrollTop = 36 * 500;
    list.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(r));

    // A 260px viewport at 36px rows needs ~8 visible rows plus buffers on both
    // sides (18 total); reading the collapsed 8px value instead would render
    // far fewer rows and leave the rest of the dropdown visibly blank.
    expect(optionEls().length).toBeGreaterThan(15);
  });

  it("runs templates once per option, not once per scroll frame", async () => {
    mountSelect("");
    const template = vi.fn((o: { label: string }) => `<em>${o.label}</em>`);
    const select = new ForgeSelect("#country", {
      data: bigData(500),
      templateResult: template,
    });
    select.open();
    const callsAfterOpen = template.mock.calls.length;
    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    for (let i = 1; i <= 5; i++) {
      list.scrollTop = i * 100;
      list.dispatchEvent(new Event("scroll"));
      await new Promise((r) => requestAnimationFrame(r));
    }
    // Scrolling re-renders rows from the cache; the template ran at most once per option.
    expect(template.mock.calls.length).toBeLessThanOrEqual(500);
    expect(template.mock.calls.length).toBeGreaterThanOrEqual(callsAfterOpen);
    const values = new Set(template.mock.calls.map(([o]) => (o as { value?: string }).value));
    expect(values.size).toBe(template.mock.calls.length);
  });

  it("coalesces rapid scroll events into a single render per animation frame", async () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: bigData(500) });
    select.open();

    const renderRows = vi.spyOn(ForgeSelect.prototype as unknown as { renderRows: () => void }, "renderRows");
    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    for (let i = 1; i <= 5; i++) {
      list.scrollTop = i * 100;
      list.dispatchEvent(new Event("scroll"));
    }
    expect(renderRows).not.toHaveBeenCalled(); // deferred until the animation frame fires

    await new Promise((r) => requestAnimationFrame(r));
    expect(renderRows).toHaveBeenCalledTimes(1);

    renderRows.mockRestore();
  });

  it("cancels a pending scroll render when the dropdown closes", async () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { data: bigData(500) });
    select.open();
    const renderRows = vi.spyOn(ForgeSelect.prototype as unknown as { renderRows: () => void }, "renderRows");
    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    list.dispatchEvent(new Event("scroll"));
    select.close();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(renderRows).not.toHaveBeenCalled();
    renderRows.mockRestore();
  });
});

describe("destroy", () => {
  it("removes the widget and restores the native select", () => {
    const el = mountSelect();
    el.style.display = "inline-block";
    el.disabled = true;
    const select = new ForgeSelect("#country");
    select.destroy();
    expect(document.querySelector(".forge-select")).toBeNull();
    expect(el.style.display).toBe("inline-block");
    expect(el.disabled).toBe(true);
  });
});

describe("advanced API integrations", () => {
  it("keeps selectAll within maxSelections for cascading tree nodes", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      multiple: true,
      maxSelections: 2,
      data: [
        {
          value: "parent",
          label: "Parent",
          children: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      ],
    });
    select.selectAll();
    expect((select.getValue() as string[]).length).toBeLessThanOrEqual(2);
  });

  it("disables remaining rows and announces/emits the maximum", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, maxSelections: 1 });
    const maximum = vi.fn();
    select.on("maximum", maximum);
    select.open();
    optionEls()[0].click();
    expect(document.querySelector(".forge-select__sr-only")?.textContent).toContain("1");
    const blocked = optionEls()[1];
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    blocked.click();
    expect(maximum).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
  });

  it("normalizes fractional maxSelections and treats invalid numbers as unlimited", () => {
    mountSelect();
    const capped = new ForgeSelect("#country", { multiple: true, maxSelections: 1.9 });
    capped.selectAll();
    expect(capped.getValue()).toHaveLength(1);
    capped.destroy();

    const unlimited = new ForgeSelect("#country", { multiple: true, maxSelections: Number.NaN });
    unlimited.selectAll();
    expect(unlimited.getValue()).toHaveLength(3);
  });

  it("hides local search below minResultsForSearch and reacts to setData", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", {
      minResultsForSearch: 3,
      data: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    expect(document.querySelector<HTMLInputElement>(".forge-select__search")!.hidden).toBe(true);
    select.setData([
      { value: "a", label: "A" },
      { value: "b", label: "B" },
      { value: "c", label: "C" },
    ]);
    expect(document.querySelector<HTMLInputElement>(".forge-select__search")!.hidden).toBe(false);
  });

  it("counts grouped and nested options toward minResultsForSearch, and a repeated value once", () => {
    mountSelect("");
    const searchBox = () => document.querySelector<HTMLInputElement>(".forge-select__search")!;
    const select = new ForgeSelect("#country", {
      minResultsForSearch: 4,
      duplicateValuePolicy: "ignore",
      data: [
        {
          label: "Group",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
        { value: "c", label: "C", children: [{ value: "d", label: "D" }] },
      ],
    });
    // Two top-level entries, but four options once the group and the tree child
    // are counted, so the threshold is met.
    expect(searchBox().hidden).toBe(false);

    select.setData([
      { value: "a", label: "A" },
      { value: "a", label: "A again" },
      { value: "a", label: "A third" },
      { value: "b", label: "B" },
      { value: "b", label: "B again" },
    ]);
    // Five entries, two distinct values: the threshold counts options a user
    // could pick, not array entries.
    expect(searchBox().hidden).toBe(true);
  });

  it("uses a custom ajax request transport instead of fetch", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => [{ value: "custom", label: "Custom" }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mountSelect("");
    const select = new ForgeSelect("#country", { ajax: { request, debounce: 0 } });
    select.open();
    await vi.runAllTimersAsync();
    expect(request).toHaveBeenCalledWith("", 0, expect.any(AbortSignal));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(optionEls()[0].textContent).toContain("Custom");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("emits select, unselect, create, and reorder details", () => {
    mountSelect();
    const select = new ForgeSelect("#country", { multiple: true, allowCreate: true, sortable: true });
    const onSelect = vi.fn();
    const onUnselect = vi.fn();
    const onCreate = vi.fn();
    const onReorder = vi.fn();
    select.on("select", onSelect);
    select.on("unselect", onUnselect);
    select.on("create", onCreate);
    select.on("reorder", onReorder);
    select.open();
    optionEls()[0].click();
    optionEls()[1].click();
    expect(onSelect).toHaveBeenCalledTimes(2);
    document
      .querySelector<HTMLElement>('.forge-select__tag[data-value="vn"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }));
    expect(onReorder).toHaveBeenCalledWith(["jp", "vn"]);
    document.querySelector<HTMLElement>(".forge-select__tag-remove")!.click();
    expect(onUnselect).toHaveBeenCalled();

    select.open();
    const input = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "New";
    input.dispatchEvent(new Event("input"));
    document.querySelector<HTMLElement>(".forge-select__option--create")!.click();
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ value: "New" }));
  });

  it("portals the dropdown and removes the host on destroy", () => {
    mountSelect();
    const portal = document.createElement("div");
    portal.id = "portal";
    document.body.append(portal);
    const select = new ForgeSelect("#country", { dropdownParent: "#portal" });
    select.open();
    expect(portal.querySelector(".forge-select--portal-host .forge-select__dropdown")).not.toBeNull();
    select.destroy();
    expect(portal.querySelector(".forge-select--portal-host")).toBeNull();
  });
});

describe("aria-activedescendant targeting", () => {
  const shortData = Array.from({ length: 4 }, (_, index) => ({ value: `v${index}`, label: `Item ${index}` }));

  it("points at the control, not the hidden search box, when search is suppressed", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const select = new ForgeSelect("#mount", { data: shortData, minResultsForSearch: 10 });
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    const search = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    expect(search.hidden).toBe(true);
    select.open();
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const highlighted = document.querySelector(".forge-select__option--highlighted")!;
    // The control is what holds focus here, so it is what must carry the
    // reference — otherwise the focused combobox announces nothing.
    expect(control.getAttribute("aria-activedescendant")).toBe(highlighted.id);
    expect(search.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("moves the reference onto the search box once it becomes visible", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const select = new ForgeSelect("#mount", { data: shortData, minResultsForSearch: 10 });
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    const search = document.querySelector<HTMLInputElement>(".forge-select__search")!;
    select.open();
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(control.getAttribute("aria-activedescendant")).not.toBeNull();
    select.updateOptions({ minResultsForSearch: 0 });
    expect(search.hidden).toBe(false);
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(search.getAttribute("aria-activedescendant")).toBe(
      document.querySelector(".forge-select__option--highlighted")!.id,
    );
    expect(control.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("drops the reference when the dropdown closes", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const select = new ForgeSelect("#mount", { data: shortData, searchable: false });
    const control = document.querySelector<HTMLElement>(".forge-select__control")!;
    select.open();
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(control.getAttribute("aria-activedescendant")).not.toBeNull();
    select.close();
    // A collapsed combobox has no active option.
    expect(control.getAttribute("aria-activedescendant")).toBeNull();
  });
});

describe("aria-setsize and aria-posinset", () => {
  it("describes the whole list, not just the virtualized window", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const data = Array.from({ length: 500 }, (_, index) => ({ value: `v${index}`, label: `Item ${index}` }));
    const select = new ForgeSelect("#mount", { data });
    select.open();
    const rendered = optionEls();
    expect(rendered.length).toBeLessThan(data.length);
    expect(rendered[0].getAttribute("aria-setsize")).toBe("500");
    expect(rendered[0].getAttribute("aria-posinset")).toBe("1");
    expect(rendered[1].getAttribute("aria-posinset")).toBe("2");
  });

  it("counts only the rows matching the current query", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const data = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
      { value: "c", label: "Alpine" },
    ];
    const select = new ForgeSelect("#mount", { data });
    select.open();
    select.setSearchQuery("Al");
    const rows = optionEls();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.getAttribute("aria-posinset"))).toEqual(["1", "2"]);
    expect(rows.every((row) => row.getAttribute("aria-setsize") === "2")).toBe(true);
  });

  it("numbers options across group headers as one flat set", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const select = new ForgeSelect("#mount", {
      data: [
        { label: "Asia", options: [{ value: "vn", label: "Vietnam" }] },
        { label: "Europe", options: [{ value: "fr", label: "France" }] },
      ],
    });
    select.open();
    // Group labels are role="presentation", so both options belong to one set.
    expect(optionEls().map((row) => row.getAttribute("aria-posinset"))).toEqual(["1", "2"]);
    expect(optionEls().map((row) => row.getAttribute("aria-setsize"))).toEqual(["2", "2"]);
  });

  it("includes the create row in the set", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const select = new ForgeSelect("#mount", { data: [{ value: "a", label: "Alpha" }], allowCreate: true });
    select.open();
    select.setSearchQuery("Zeta");
    const create = document.querySelector<HTMLElement>(".forge-select__option--create")!;
    expect(create.getAttribute("aria-setsize")).toBe("1");
    expect(create.getAttribute("aria-posinset")).toBe("1");
  });
});

describe("data array ownership", () => {
  it("does not append created options to the caller's array", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const mine = [{ value: "a", label: "Alpha" }];
    const select = new ForgeSelect("#mount", { data: mine, allowCreate: true, multiple: true });
    select.open();
    select.setSearchQuery("Bravo");
    document.querySelector<HTMLElement>(".forge-select__option--create")!.click();
    expect(select.getValue()).toEqual(["Bravo"]);
    expect(mine).toHaveLength(1);
  });

  it("does not append created options to an array passed to setData", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const select = new ForgeSelect("#mount", { data: [], allowCreate: true, multiple: true });
    const replacement = [{ value: "a", label: "Alpha" }];
    select.setData(replacement);
    select.open();
    select.setSearchQuery("Bravo");
    document.querySelector<HTMLElement>(".forge-select__option--create")!.click();
    expect(replacement).toHaveLength(1);
  });

  it("ignores later mutations of the caller's array, as documented", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const mine = [{ value: "a", label: "Alpha" }];
    const select = new ForgeSelect("#mount", { data: mine });
    mine.push({ value: "b", label: "Beta" });
    select.open();
    expect(optionEls()).toHaveLength(1);
    select.setData(mine);
    expect(optionEls()).toHaveLength(2);
  });
});

describe("bulk selection", () => {
  const tree = [
    {
      value: "p",
      label: "Parent",
      children: [
        { value: "c1", label: "One" },
        { value: "c2", label: "Two" },
      ],
    },
  ];

  it("setValue applies the tree cascade exactly once", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const select = new ForgeSelect("#mount", { multiple: true, data: tree });
    select.setValue(["p"]);
    expect(select.getValue()).toEqual(["p", "c1", "c2"]);
  });

  it("setValue marks a parent selected once every child is listed", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const select = new ForgeSelect("#mount", { multiple: true, data: tree });
    select.setValue(["c1", "c2"]);
    expect((select.getValue() as string[]).slice().sort()).toEqual(["c1", "c2", "p"]);
  });

  it("setValue drops duplicates in the incoming list", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const select = new ForgeSelect("#mount", {
      multiple: true,
      data: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ],
    });
    select.setValue(["a", "b", "a"]);
    expect(select.getValue()).toEqual(["a", "b"]);
  });

  it("selectAll stops at maxSelections without scanning the rest", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const data = Array.from({ length: 200 }, (_, index) => ({ value: `v${index}`, label: `Item ${index}` }));
    const select = new ForgeSelect("#mount", { data, multiple: true, maxSelections: 3 });
    select.selectAll();
    expect(select.getValue()).toEqual(["v0", "v1", "v2"]);
  });

  it("selectAll still skips disabled options", () => {
    document.body.innerHTML = `<div id="mount"></div>`;
    const select = new ForgeSelect("#mount", {
      multiple: true,
      data: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta", disabled: true },
        { value: "c", label: "Gamma" },
      ],
    });
    select.selectAll();
    expect(select.getValue()).toEqual(["a", "c"]);
  });

  it("keeps a native <select multiple> in sync after a bulk setValue", () => {
    mountSelect(`<option value="vn">Vietnam</option><option value="jp">Japan</option><option value="us">US</option>`);
    const native = document.querySelector<HTMLSelectElement>("#country")!;
    native.multiple = true;
    const select = new ForgeSelect("#country", { multiple: true });
    select.setValue(["vn", "us"]);
    expect(Array.from(native.selectedOptions, (option) => option.value)).toEqual(["vn", "us"]);
    select.setValue(["jp"]);
    expect(Array.from(native.selectedOptions, (option) => option.value)).toEqual(["jp"]);
  });
});
