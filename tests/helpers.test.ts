import { describe, expect, it } from "vitest";
import { parseNativeOptions } from "../src/native-select";
import { renderOptionContent } from "../src/option-renderer";
import { computeDropdownPlacement } from "../src/dropdown-position";
import { buildUrl, normalizeRemoteResult } from "../src/remote";
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
