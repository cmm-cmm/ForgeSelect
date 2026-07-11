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

  it("applies the theme attribute", () => {
    mountSelect();
    new ForgeSelect("#country", { theme: "dark" });
    expect(document.querySelector<HTMLElement>(".forge-select")?.dataset.theme).toBe("dark");
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
    const groups = Array.from(document.querySelectorAll(".forge-select__group-label")).map(
      (el) => el.textContent,
    );
    expect(groups).toEqual(["Asia", "Americas"]);
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

  it("skips disabled options", () => {
    mountSelect(
      `<option value="a">A</option><option value="b" disabled>B</option><option value="c">C</option>`,
    );
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
    expect(document.querySelector(".forge-select__empty")?.textContent).toBe(
      "Không tìm thấy kết quả",
    );
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

    await vi.advanceTimersByTimeAsync(150);
    expect(fetchMock).toHaveBeenCalledWith("/api/users?q=");
    expect(optionEls().map((li) => li.textContent)).toEqual(["Ada"]);

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});

describe("virtual scrolling", () => {
  it("renders a window with spacers for large lists", () => {
    mountSelect("");
    const data = Array.from({ length: 5000 }, (_, i) => ({
      value: String(i),
      label: `Item ${i}`,
    }));
    const select = new ForgeSelect("#country", { virtualScroll: true, data });
    select.open();

    const rendered = optionEls();
    expect(rendered.length).toBeLessThan(100);
    expect(document.querySelectorAll(".forge-select__spacer")).toHaveLength(2);
  });
});

describe("destroy", () => {
  it("removes the widget and restores the native select", () => {
    const el = mountSelect();
    const select = new ForgeSelect("#country");
    select.destroy();
    expect(document.querySelector(".forge-select")).toBeNull();
    expect(el.style.display).toBe("");
  });
});
