import { describe, expect, it } from "vitest";
import { parseNativeOptions } from "../src/native-select";
import { renderOptionContent } from "../src/option-renderer";
import { computeDropdownPlacement } from "../src/dropdown-position";
import { buildUrl, normalizeRemoteResult } from "../src/remote";
import { RemoteCache } from "../src/remote-cache";
import { findNormalizedRanges, getSearchField, normalizeSearchText, scoreOption, SearchIndex } from "../src/search";
import {
  arraysEqual,
  collectDescendantValues,
  collectValues,
  computeCheckState,
  findOption,
  syncTreeAncestors,
} from "../src/selection";
import type { DataItem, Option } from "../src/types";

const tree: Option = {
  value: "root",
  label: "Root",
  children: [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ],
};

describe("selection helpers", () => {
  it("collects descendants and derives tree state", () => {
    expect(collectDescendantValues(tree)).toEqual(["a", "b"]);
    expect(computeCheckState(tree, [])).toBe("none");
    expect(computeCheckState(tree, ["a"])).toBe("some");
    expect(computeCheckState(tree, ["a", "b"])).toBe("all");
  });

  it("excludes disabled descendants from cascade collection and check-state aggregation", () => {
    const withDisabled: Option = {
      value: "root",
      label: "Root",
      children: [
        { value: "a", label: "A" },
        { value: "b", label: "B", disabled: true },
      ],
    };
    // Disabled children can never be un-toggled through the UI (excluded
    // from navItems), so cascading selection must not sweep them in.
    expect(collectDescendantValues(withDisabled)).toEqual(["a"]);
    // With "b" disabled and unselectable, "a" alone should read as "all".
    expect(computeCheckState(withDisabled, ["a"])).toBe("all");
  });

  it("finds nested options, recursively collects values, and synchronizes parents", () => {
    const data: DataItem[] = [{ label: "Group", options: [tree] }];
    expect(findOption(data, "b")?.label).toBe("B");
    expect([...collectValues(data)]).toEqual(["root", "a", "b"]);
    const selected = ["a", "b"];
    syncTreeAncestors(data, selected);
    expect(selected).toEqual(["a", "b", "root"]);
    selected.pop();
    selected.pop();
    syncTreeAncestors(data, selected);
    expect(selected).toEqual(["a"]);
  });

  it("compares ordered values", () => {
    expect(arraysEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(arraysEqual(["a", "b"], ["b", "a"])).toBe(false);
  });
});

describe("native and remote helpers", () => {
  it("parses native groups and inherited disabled state", () => {
    document.body.innerHTML =
      '<select><optgroup label="Blocked" disabled><option value="a"> A </option></optgroup></select>';
    const data = parseNativeOptions(document.querySelector("select")!);
    expect(data).toEqual([{ label: "Blocked", options: [{ value: "a", label: "A", disabled: true }] }]);
  });

  it("parses a top-level option (no optgroup) with an empty label", () => {
    document.body.innerHTML = '<select><option value="empty"></option></select>';
    const data = parseNativeOptions(document.querySelector("select")!);
    expect(data).toEqual([{ value: "empty", label: "", disabled: undefined }]);
  });

  it("builds paginated URLs and normalizes response shapes", () => {
    const ajax = {
      url: "/api?kind=user",
      pagination: true,
      params: (query: string, page: number) => ({ query, page }),
      transform: (response: unknown) => response as { options: Option[]; hasMore: boolean },
    };
    expect(buildUrl(ajax, "ana", 2)).toBe("/api?kind=user&query=ana&page=2");
    expect(normalizeRemoteResult(ajax, { options: [tree], hasMore: true })).toEqual({
      options: [tree],
      hasMore: true,
    });
  });

  it("passes the page number to a function-based ajax.url", () => {
    const url = (query: string, page: number) => `/api?q=${query}&p=${page}`;
    expect(buildUrl({ url }, "ana", 3)).toBe("/api?q=ana&p=3");
  });

  it("rejects a malformed ajax.transform result instead of returning a broken shape", () => {
    const ajax = { url: "/api", transform: () => ({ notOptions: [] }) as unknown as Option[] };
    expect(() => normalizeRemoteResult(ajax, {})).toThrow(/ajax\.transform must return/);
  });
});

describe("option renderer", () => {
  it("renders built-in rich content without interpreting text as HTML", () => {
    const container = document.createElement("div");
    renderOptionContent(container, {
      value: "safe",
      label: '<img src=x onerror="alert(1)">',
      description: "Description",
      avatar: "/avatar.png",
    });
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector(".forge-select__option-label")?.textContent).toContain("<img");
  });

  it("supports Node and string custom templates", () => {
    const nodeContainer = document.createElement("div");
    const node = document.createElement("strong");
    node.textContent = "Node";
    renderOptionContent(nodeContainer, tree, () => node);
    expect(nodeContainer.firstElementChild).toBe(node);

    const htmlContainer = document.createElement("div");
    renderOptionContent(htmlContainer, tree, () => "<strong>HTML</strong>");
    expect(htmlContainer.querySelector("strong")?.textContent).toBe("HTML");
  });
});

describe("dropdown positioning", () => {
  it("computes below and above placements from viewport geometry", () => {
    expect(computeDropdownPlacement({ top: 10, bottom: 40 }, 200, 800)).toEqual({ dropUp: false, top: 44 });
    expect(computeDropdownPlacement({ top: 700, bottom: 730 }, 200, 800)).toEqual({ dropUp: true, top: 496 });
  });
});

describe("search and cache helpers", () => {
  it("normalizes accents and matches tokens across configured fields", () => {
    const option: Option = {
      value: "dn",
      label: "Đà Nẵng",
      description: "Thành phố biển",
      meta: { team: { name: "Miền Trung" } },
    };
    expect(normalizeSearchText("Đà Nẵng")).toBe("da nang");
    expect(getSearchField(option, "meta.team.name")).toBe("Miền Trung");
    expect(
      scoreOption(option, "da bien", {
        fields: ["label", "description"],
        tokenSearch: true,
        accentInsensitive: true,
      }),
    ).toBeGreaterThan(0);
    expect(findNormalizedRanges(option.label, "nang")).toEqual([[3, 7]]);
    expect(normalizeSearchText("Á", false)).toBe("á");
    expect(getSearchField(option, "label")).toBe("Đà Nẵng");
    expect(getSearchField(option, "description")).toBe("Thành phố biển");
    expect(getSearchField(option, "meta.missing.value")).toBe("");
    expect(scoreOption(option, "", { fields: ["label"], tokenSearch: true, accentInsensitive: true })).toBe(1);
    expect(
      scoreOption(option, "anything", {
        fields: ["label"],
        tokenSearch: false,
        accentInsensitive: true,
        scorer: () => 7,
      }),
    ).toBe(7);
    expect(scoreOption(option, "missing", { fields: ["label"], tokenSearch: false, accentInsensitive: true })).toBe(0);
    expect(findNormalizedRanges(option.label, "")).toEqual([]);
    const index = new SearchIndex();
    const config = { fields: ["label"] as const, tokenSearch: true, accentInsensitive: true };
    expect(index.score(option, "da", { ...config, fields: [...config.fields] })).toBeGreaterThan(0);
    expect(index.score(option, "missing", { ...config, fields: [...config.fields] })).toBe(0);
    index.clear();
  });

  it("expires cached remote pages", () => {
    const cache = new RemoteCache<string>();
    cache.set("q", "value", 10, 100);
    expect(cache.get("q", 109)).toBe("value");
    expect(cache.get("q", 110)).toBeUndefined();
  });

  it("bounds its size with FIFO eviction instead of growing unboundedly", () => {
    const cache = new RemoteCache<string>();
    for (let i = 0; i < 60; i += 1) cache.set(`q${i}`, `value${i}`, 60_000, 0);
    // The oldest entries (q0..q9) were evicted to make room for the newest 50.
    expect(cache.get("q0", 0)).toBeUndefined();
    expect(cache.get("q9", 0)).toBeUndefined();
    expect(cache.get("q10", 0)).toBe("value10");
    expect(cache.get("q59", 0)).toBe("value59");
  });
});
