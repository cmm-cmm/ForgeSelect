import type { Option, SearchField, SearchScorer } from "./types";

export interface SearchConfig {
  fields: SearchField[];
  tokenSearch: boolean;
  accentInsensitive: boolean;
  scorer?: SearchScorer;
}

export function normalizeSearchText(value: string, accentInsensitive = true): string {
  const lower = value.toLocaleLowerCase();
  return accentInsensitive
    ? lower
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
    : lower;
}

export function getSearchField(option: Option, field: SearchField): string {
  if (field === "label") return option.label;
  if (field === "description") return option.description ?? "";
  const path = field.slice(5).split(".");
  let value: unknown = option.meta;
  for (const key of path) {
    if (!value || typeof value !== "object") return "";
    value = (value as Record<string, unknown>)[key];
  }
  return value == null ? "" : String(value);
}

/**
 * Everything `score()` derives from the query and the config rather than from
 * the option being scored. A filtering pass scores every option against a
 * single query, so these are exactly the values that would otherwise be
 * rebuilt once per option.
 */
export interface PreparedQuery {
  readonly trimmed: string;
  readonly normalized: string;
  readonly tokens: readonly string[];
  readonly cacheKey: string;
  readonly labelIndex: number;
  readonly config: SearchConfig;
}

export class SearchIndex {
  private cache = new WeakMap<Option, Map<string, string[]>>();

  clear(): void {
    this.cache = new WeakMap();
  }

  /**
   * Hoists the query-invariant half of scoring out of the per-option loop.
   * Normalizing the query (NFD plus two regex passes), splitting it into
   * tokens, and building the haystack cache key depend only on the query and
   * the config, so a filtering pass prepares once and scores per option.
   */
  prepare(query: string, config: SearchConfig): PreparedQuery {
    const trimmed = query.trim();
    const normalized = normalizeSearchText(trimmed, config.accentInsensitive);
    return {
      trimmed,
      normalized,
      tokens: config.tokenSearch ? normalized.split(/\s+/).filter(Boolean) : [normalized],
      cacheKey: `${config.accentInsensitive ? "1" : "0"}:${config.fields.join("\u0000")}`,
      labelIndex: config.fields.indexOf("label"),
      // Snapshot rather than hold the caller's object: every value above is
      // derived from the config as it reads now, so a later mutation would
      // have scorePrepared() build haystacks under settings the query was
      // never normalized for — accentInsensitive flipped between the two
      // calls is enough to make a match miss.
      config: { ...config, fields: [...config.fields] },
    };
  }

  /**
   * Scores one option against an already-prepared query. Pair it with
   * `prepare()`; the prepared value carries its own copy of the config, so the
   * two cannot disagree about how the query was normalized.
   */
  scorePrepared(option: Option, prepared: PreparedQuery): number {
    const { normalized, config } = prepared;
    if (!normalized) return 1;
    if (config.scorer) return config.scorer(option, prepared.trimmed, normalized);
    let variants = this.cache.get(option);
    if (!variants) {
      variants = new Map();
      this.cache.set(option, variants);
    }
    let haystacks = variants.get(prepared.cacheKey);
    if (!haystacks) {
      haystacks = config.fields.map((field) =>
        normalizeSearchText(getSearchField(option, field), config.accentInsensitive),
      );
      variants.set(prepared.cacheKey, haystacks);
    }
    if (!prepared.tokens.every((token) => haystacks.some((field) => field.includes(token)))) return 0;
    const label = haystacks[prepared.labelIndex];
    if (label === normalized) return 4;
    if (label?.startsWith(normalized)) return 3;
    if (label?.includes(normalized)) return 2;
    return 1;
  }

  score(option: Option, query: string, config: SearchConfig): number {
    return this.scorePrepared(option, this.prepare(query, config));
  }
}

/**
 * Normalizes `value` while recording, for every code unit of the result, the
 * index in `value` it came from. `map` carries one trailing sentinel equal to
 * `value.length`, so a half-open range [start, end) in the normalized text maps
 * to [map[start], map[end]) in the original.
 *
 * Normalization is not length-preserving — stripping combining marks shortens a
 * decomposed label ("Cafe" + U+0301 loses a code unit), and lowercasing can
 * lengthen one (U+0130 -> "i" + U+0307) — so normalized indices cannot be used
 * against the raw string directly. Walking code point by code point keeps the
 * correspondence exact instead of assuming a 1:1 mapping.
 */
function normalizeWithMap(value: string, accentInsensitive: boolean): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let offset = 0;
  for (const char of value) {
    const normalized = normalizeSearchText(char, accentInsensitive);
    for (let i = 0; i < normalized.length; i += 1) map.push(offset);
    text += normalized;
    offset += char.length;
  }
  map.push(value.length);
  return { text, map };
}

/** Ranges are indices into `label` itself, ready to slice for <mark> wrapping. */
export function findNormalizedRanges(label: string, query: string, accentInsensitive = true): Array<[number, number]> {
  const tokens = normalizeSearchText(query.trim(), accentInsensitive).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const { text, map } = normalizeWithMap(label, accentInsensitive);
  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    const index = text.indexOf(token);
    if (index >= 0) ranges.push([map[index], map[index + token.length]]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}
