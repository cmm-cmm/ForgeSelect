import { describe, expect, it } from "vitest";
import { parseNativeOptions } from "../src/native-select";
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
});
