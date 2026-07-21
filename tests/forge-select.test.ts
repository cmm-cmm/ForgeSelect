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

describe("allowCreate (tags mode)", () => {
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
});

describe("ajax pagination", () => {
  type Item = { id: string; name: string };

  function transform(res: unknown) {
    const r = res as { items: Item[]; hasMore: boolean };
    return { options: r.items.map((i) => ({ value: i.id, label: i.name })), hasMore: r.hasMore };
  }

  function pagedFetchMock() {
    return vi.fn().mockImplementation((url: string) => {
      const page = url.includes("page=1") ? 1 : 0;
      const items: Item[] =
        page === 0
          ? [
              { id: "a", name: "Alpha" },
              { id: "b", name: "Beta" },
            ]
          : [
              { id: "c", name: "Gamma" },
              { id: "d", name: "Delta" },
            ];
      return Promise.resolve({ json: () => Promise.resolve({ items, hasMore: page === 0 }) });
    });
  }

  function mockNearBottom(list: HTMLElement): void {
    Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(list, "clientHeight", { value: 260, configurable: true });
    Object.defineProperty(list, "scrollTop", { value: 800, configurable: true, writable: true });
  }

  it("appends the next page instead of replacing when scrolled near the bottom", async () => {
    const fetchMock = pagedFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    mountSelect("");
    const select = new ForgeSelect("#country", {
      ajax: { url: "/api/items", pagination: true, params: (q, page) => ({ q, page }), transform },
    });

    select.open();
    await new Promise((r) => setTimeout(r, 0));
    expect(optionEls().map((li) => li.textContent)).toEqual(["Alpha", "Beta"]);

    const list = document.querySelector<HTMLElement>(".forge-select__list")!;
    mockNearBottom(list);
    list.dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("page=1");
    expect(optionEls().map((li) => li.textContent)).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);

    vi.unstubAllGlobals();
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

  it("renders a window with spacers for large lists", () => {
    mountSelect("");
    const select = new ForgeSelect("#country", { virtualScroll: true, data: bigData(5000) });
    select.open();

    const rendered = optionEls();
    expect(rendered.length).toBeLessThan(100);
    expect(document.querySelectorAll(".forge-select__spacer")).toHaveLength(2);
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

  it("advances the window when scrolled, despite browser scrollTop clamping", () => {
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

    const labels = optionEls().map((li) => li.textContent);
    expect(labels).not.toContain("Item 0");
    expect(labels).toContain("Item 500");
    // The offset survives the re-render instead of snapping back to 0.
    expect(list.scrollTop).toBe(36 * 500);
  });

  it("uses the real viewport height, not the collapsed height while the list is cleared", () => {
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

    // A 260px viewport at 36px rows needs ~8 visible rows plus buffers on both
    // sides (18 total); reading the collapsed 8px value instead would render
    // far fewer rows and leave the rest of the dropdown visibly blank.
    expect(optionEls().length).toBeGreaterThan(15);
  });

  it("runs templates once per option, not once per scroll frame", () => {
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
    }
    // Scrolling re-renders rows from the cache; the template ran at most once per option.
    expect(template.mock.calls.length).toBeLessThanOrEqual(500);
    expect(template.mock.calls.length).toBeGreaterThanOrEqual(callsAfterOpen);
    const values = new Set(template.mock.calls.map(([o]) => (o as { value?: string }).value));
    expect(values.size).toBe(template.mock.calls.length);
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
