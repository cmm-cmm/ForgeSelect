import { describe, expect, it } from "vitest";
import { format, getStrings } from "../src/i18n";
import { parseNativeOptions } from "../src/native-select";
import { renderOptionContent } from "../src/option-renderer";
import { computeDropdownPlacement } from "../src/dropdown-position";
import { buildUrl, normalizeRemoteResult } from "../src/remote";
import { RemoteCache } from "../src/remote-cache";
import { findNormalizedRanges, getSearchField, normalizeSearchText, SearchIndex } from "../src/search";
import type { SearchConfig } from "../src/search";
import {
  arraysEqual,
  collectDescendantValues,
  collectValues,
  computeCheckState,
  findOption,
  syncTreeAncestors,
} from "../src/selection";
import type { DataItem, Option, SearchField } from "../src/types";

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

  it("reads membership through has() for any set, not only this realm's Set", () => {
    // The parameter is typed ReadonlySet, which a cross-realm Set or a
    // structural implementation satisfies without being an instance of this
    // realm's Set. Only has() may be assumed.
    const structural = {
      has: (value: string) => value === "a",
    } as unknown as ReadonlySet<string>;
    expect(computeCheckState(tree, structural)).toBe("some");
    expect(computeCheckState(tree, new Set(["a", "b"]))).toBe("all");
    expect(computeCheckState(tree, new Set<string>())).toBe("none");
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

  it("skips select children that are neither <option> nor <optgroup>", () => {
    document.body.innerHTML = '<select><!-- note --><script></script><option value="a">A</option><hr></select>';
    const data = parseNativeOptions(document.querySelector("select")!);
    expect(data).toEqual([{ value: "a", label: "A", disabled: undefined }]);
  });

  it("keeps an enabled option inside an enabled group undisabled", () => {
    document.body.innerHTML = '<select><optgroup label="Open"><option value="a">A</option></optgroup></select>';
    const data = parseNativeOptions(document.querySelector("select")!);
    expect(data).toEqual([{ label: "Open", options: [{ value: "a", label: "A", disabled: undefined }] }]);
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
      new SearchIndex().score(option, "da bien", {
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
    expect(new SearchIndex().score(option, "", { fields: ["label"], tokenSearch: true, accentInsensitive: true })).toBe(
      1,
    );
    expect(
      new SearchIndex().score(option, "anything", {
        fields: ["label"],
        tokenSearch: false,
        accentInsensitive: true,
        scorer: () => 7,
      }),
    ).toBe(7);
    expect(
      new SearchIndex().score(option, "missing", { fields: ["label"], tokenSearch: false, accentInsensitive: true }),
    ).toBe(0);
    expect(findNormalizedRanges(option.label, "")).toEqual([]);
    const index = new SearchIndex();
    const config = { fields: ["label"] as const, tokenSearch: true, accentInsensitive: true };
    expect(index.score(option, "da", { ...config, fields: [...config.fields] })).toBeGreaterThan(0);
    expect(index.score(option, "missing", { ...config, fields: [...config.fields] })).toBe(0);
    index.clear();
  });

  it("scores a prepared query identically to the one-shot path", () => {
    const option: Option = { value: "dn", label: "Đà Nẵng", description: "Thành phố biển" };
    const other: Option = { value: "hn", label: "Hà Nội" };
    const configs = [
      { fields: ["label"] as SearchField[], tokenSearch: true, accentInsensitive: true },
      { fields: ["label", "description"] as SearchField[], tokenSearch: true, accentInsensitive: true },
      { fields: ["label"] as SearchField[], tokenSearch: false, accentInsensitive: true },
      { fields: ["label"] as SearchField[], tokenSearch: true, accentInsensitive: false },
      { fields: ["label"] as SearchField[], tokenSearch: true, accentInsensitive: true, scorer: () => 7 },
    ];
    // prepare() splits out the query-invariant half of score(); every path
    // through it has to land on the number score() would have returned.
    for (const config of configs) {
      for (const query of ["", "  ", "da nang", "Đà", "bien", "missing", "Đà Nẵng"]) {
        for (const subject of [option, other]) {
          const prepared = new SearchIndex().prepare(query, config);
          expect(new SearchIndex().scorePrepared(subject, prepared)).toBe(
            new SearchIndex().score(subject, query, config),
          );
        }
      }
    }
  });

  it("reuses one prepared query across options without leaking the first option's haystack", () => {
    const index = new SearchIndex();
    const config = { fields: ["label"] as SearchField[], tokenSearch: true, accentInsensitive: true };
    const prepared = index.prepare("nang", config);
    expect(index.scorePrepared({ value: "dn", label: "Đà Nẵng" }, prepared)).toBeGreaterThan(0);
    expect(index.scorePrepared({ value: "hn", label: "Hà Nội" }, prepared)).toBe(0);
    expect(index.scorePrepared({ value: "x", label: "nang" }, prepared)).toBe(4);
  });

  it("keeps a prepared query on the config it was prepared with when the caller mutates it", () => {
    const index = new SearchIndex();
    const config: SearchConfig = { fields: ["label"], tokenSearch: true, accentInsensitive: true };
    const option: Option = { value: "dn", label: "Đà Nẵng" };
    const prepared = index.prepare("Đà", config);

    // "Đà" was normalized to "da" under accentInsensitive. Scoring the label as
    // "đà nẵng" afterwards would look for "da" in it and miss, so the prepared
    // query has to keep the settings it was built from.
    config.accentInsensitive = false;
    config.tokenSearch = false;
    config.fields.push("description");
    expect(index.scorePrepared(option, prepared)).toBe(3);
  });

  it("ranks against the label even when it is not the first configured field", () => {
    // The relevance tiers read one specific haystack, so a prepared query has
    // to carry where "label" actually sits rather than assuming it leads.
    const index = new SearchIndex();
    const config: SearchConfig = {
      fields: ["description", "label"],
      tokenSearch: true,
      accentInsensitive: true,
    };
    const option: Option = { value: "a", label: "Alpha", description: "Beta" };
    // 4 is the exact-label tier; scoring the description haystack by mistake
    // still matches, but only at the weakest tier.
    expect(index.score(option, "alpha", config)).toBe(4);
    expect(index.score(option, "beta", config)).toBe(1);
    expect(index.score({ value: "b", label: "Alphabet", description: "" }, "alpha", config)).toBe(3);
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

describe("i18n", () => {
  it("falls back to English for an unknown locale code", () => {
    expect(getStrings("kl").noResults).toBe(getStrings("en").noResults);
  });

  it("layers a custom string table over the English defaults", () => {
    const strings = getStrings({ noResults: "Nothing here" });
    expect(strings.noResults).toBe("Nothing here");
    // Keys the caller did not override still resolve.
    expect(strings.loading).toBe(getStrings("en").loading);
  });

  it("leaves placeholders without a matching variable untouched", () => {
    expect(format("Create {query} in {scope}", { query: "x" })).toBe("Create x in {scope}");
  });
});

describe("findNormalizedRanges index mapping", () => {
  it("maps ranges back onto the raw label when normalization changes its length", () => {
    // Stripping the combining acute shortens the normalized form by one code
    // unit, so normalized indices used directly against the source would cut
    // between "e" and its own accent and render the mark on the wrong glyph.
    const decomposed = "Cafe\u0301";
    expect(decomposed).toHaveLength(5);
    const [start, end] = findNormalizedRanges(decomposed, "cafe")[0];
    expect(decomposed.slice(start, end)).toBe(decomposed);
  });

  it("returns the same slice for the precomposed and decomposed spellings", () => {
    const precomposed = "Café";
    const decomposed = "Cafe\u0301";
    const slice = (label: string) => {
      const [start, end] = findNormalizedRanges(label, "cafe")[0];
      return label.slice(start, end).normalize("NFC");
    };
    expect(slice(precomposed)).toBe(slice(decomposed));
  });

  it("maps a partial match that starts after an accented character", () => {
    const label = "Cafe\u0301 Bar";
    const [start, end] = findNormalizedRanges(label, "bar")[0];
    expect(label.slice(start, end)).toBe("Bar");
  });

  it("handles a lowercasing that lengthens the text", () => {
    // U+0130 lowercases to "i" + U+0307, so the normalized form is longer than
    // the source here — the opposite skew from stripping marks.
    const label = "\u0130stanbul";
    const [start, end] = findNormalizedRanges(label, "istanbul")[0];
    expect(label.slice(start, end)).toBe(label);
  });

  it("still returns no ranges for an empty query", () => {
    expect(findNormalizedRanges("Café", "   ")).toEqual([]);
  });
});
