import type { AjaxConfig, Option } from "./types";

export function buildUrl(ajax: AjaxConfig, query: string, page: number): string {
  if (typeof ajax.url === "function") return ajax.url(query);
  if (!ajax.params) return ajax.url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ajax.params(query, page))) params.set(key, String(value));
  const separator = ajax.url.includes("?") ? "&" : "?";
  return `${ajax.url}${separator}${params.toString()}`;
}

export function normalizeRemoteResult(ajax: AjaxConfig, response: unknown): { options: Option[]; hasMore: boolean } {
  const result = ajax.transform ? ajax.transform(response) : (response as Option[]);
  return {
    options: Array.isArray(result) ? result : result.options,
    hasMore: ajax.pagination ? (Array.isArray(result) ? false : result.hasMore) : false,
  };
}
