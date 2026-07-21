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

export function scoreOption(option: Option, query: string, config: SearchConfig): number {
  const normalizedQuery = normalizeSearchText(query.trim(), config.accentInsensitive);
  if (!normalizedQuery) return 1;
  if (config.scorer) return config.scorer(option, query.trim(), normalizedQuery);
  const haystacks = config.fields.map((field) =>
    normalizeSearchText(getSearchField(option, field), config.accentInsensitive),
  );
  const tokens = config.tokenSearch ? normalizedQuery.split(/\s+/).filter(Boolean) : [normalizedQuery];
  if (!tokens.every((token) => haystacks.some((field) => field.includes(token)))) return 0;
  const label = haystacks[config.fields.indexOf("label")];
  if (label === normalizedQuery) return 4;
  if (label?.startsWith(normalizedQuery)) return 3;
  if (label?.includes(normalizedQuery)) return 2;
  return 1;
}

export class SearchIndex {
  private cache = new WeakMap<Option, Map<string, string[]>>();

  clear(): void {
    this.cache = new WeakMap();
  }

  score(option: Option, query: string, config: SearchConfig): number {
    const normalizedQuery = normalizeSearchText(query.trim(), config.accentInsensitive);
    if (!normalizedQuery) return 1;
    if (config.scorer) return config.scorer(option, query.trim(), normalizedQuery);
    const key = `${config.accentInsensitive ? "1" : "0"}:${config.fields.join("\u0000")}`;
    let variants = this.cache.get(option);
    if (!variants) {
      variants = new Map();
      this.cache.set(option, variants);
    }
    let haystacks = variants.get(key);
    if (!haystacks) {
      haystacks = config.fields.map((field) =>
        normalizeSearchText(getSearchField(option, field), config.accentInsensitive),
      );
      variants.set(key, haystacks);
    }
    const tokens = config.tokenSearch ? normalizedQuery.split(/\s+/).filter(Boolean) : [normalizedQuery];
    if (!tokens.every((token) => haystacks.some((field) => field.includes(token)))) return 0;
    const label = haystacks[config.fields.indexOf("label")];
    if (label === normalizedQuery) return 4;
    if (label?.startsWith(normalizedQuery)) return 3;
    if (label?.includes(normalizedQuery)) return 2;
    return 1;
  }
}

export function findNormalizedRanges(label: string, query: string, accentInsensitive = true): Array<[number, number]> {
  const tokens = normalizeSearchText(query.trim(), accentInsensitive).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const normalized = normalizeSearchText(label, accentInsensitive);
  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    const index = normalized.indexOf(token);
    if (index >= 0) ranges.push([index, index + token.length]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}
