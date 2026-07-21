import type ForgeSelect from "./ForgeSelect";

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
  /** Image URL or data URI rendered as a round avatar next to the label. */
  avatar?: string;
  /** Secondary line rendered under the label in the dropdown. */
  description?: string;
  /** Arbitrary payload for custom templates; ForgeSelect never reads it. */
  meta?: Record<string, unknown>;
  /** Extra CSS class(es) applied to this option's rendered <li>. */
  className?: string;
  /**
   * Nested options, making this a tree node. Purely additive: lists where
   * no option has `children` render and behave exactly as a flat list.
   */
  children?: Option[];
}

export interface OptionGroup {
  label: string;
  options: Option[];
}

export type DataItem = Option | OptionGroup;

export interface AjaxConfig {
  /** GET endpoint. Optional when `request` supplies a custom transport. */
  url?: string | ((query: string, page: number) => string);
  /**
   * Custom transport for POST/authenticated/GraphQL requests. Takes precedence
   * over `url`; the returned payload is passed through `transform`.
   */
  request?: (query: string, page: number, signal: AbortSignal) => Promise<unknown>;
  params?: (query: string, page: number) => Record<string, unknown>;
  /** Debounce in milliseconds. Default 250. */
  debounce?: number;
  /** Load the initial empty query when the dropdown opens. Default true. */
  loadOnOpen?: boolean;
  /** Cache successful pages for this many milliseconds. Set 0 to disable. Default 30000. */
  cacheTtl?: number;
  /** Number of retries after a failed request. Default 0. */
  retry?: number;
  /** Base delay for exponential retry backoff. Default 250ms. */
  retryDelay?: number;
  /** Queries to warm in the background after construction. */
  prefetch?: string[];
  /**
   * Opt in to loading additional pages as the user scrolls near the bottom
   * of the dropdown, instead of only reloading on search. Default false.
   */
  pagination?: boolean;
  /**
   * Return a plain array (page-replace behavior, unchanged from before
   * `pagination` existed) or `{ options, hasMore }` so ForgeSelect knows
   * whether to keep requesting further pages when `pagination` is true.
   */
  transform?: (response: unknown) => Option[] | { options: Option[]; hasMore: boolean };
}

export interface ForgeSelectPlugin {
  name: string;
  onInit?(select: ForgeSelect): void;
  onOpen?(select: ForgeSelect): void;
  onClose?(select: ForgeSelect): void;
  onDestroy?(select: ForgeSelect): void;
}

export type TemplateFn = (option: Option) => string | Node;
export type SearchField = "label" | "description" | `meta.${string}`;
export type SearchScorer = (option: Option, query: string, normalizedQuery: string) => number;

export interface ForgeSelectOptions {
  placeholder?: string;
  searchable?: boolean;
  multiple?: boolean;
  clearable?: boolean;
  allowCreate?: boolean;
  /**
   * Let the user reorder selected tags by dragging them (mouse/touch/pen via
   * Pointer Events), or via Alt+Left/Alt+Right when a tag has focus. Only
   * meaningful when `multiple` is true. Default false — existing multi-select
   * behavior and tag markup are unchanged when this is left off.
   */
  sortable?: boolean;
  /**
   * Multi-select only: close the dropdown immediately after each pick
   * instead of staying open for further selections. Default false —
   * existing multi-select behavior (stays open) is unchanged.
   */
  closeOnSelect?: boolean;
  /**
   * Multi-select only: caps the number of selected values. Once reached,
   * further picks (including via allowCreate) are ignored until one is
   * removed. Only gates interactive selection — setValue() is not clamped.
   * Default undefined (no limit).
   */
  maxSelections?: number;
  theme?: string;
  disabled?: boolean;
  /**
   * Marks the field as required for native form validation. When mounted on
   * a real <select>, an empty selection blocks form submission and shows
   * inline invalid styling, mirroring native <select required> behavior.
   * On a plain-element mount this only sets aria-required (no native form
   * to hook into). Default false.
   */
  required?: boolean;
  data?: DataItem[];
  ajax?: AjaxConfig;
  templateResult?: TemplateFn;
  templateSelection?: TemplateFn;
  /**
   * Custom match predicate, replacing the built-in label/description
   * substring match. Receives the trimmed (not lowercased) query.
   */
  filterOption?: (option: Option, query: string) => boolean;
  /** Fields used by built-in search. Default: label and description. */
  searchFields?: SearchField[];
  /** Split the query into tokens which may match across fields. Default true. */
  tokenSearch?: boolean;
  /** Match text without case or diacritics. Default true. */
  accentInsensitive?: boolean;
  /** Optional relevance scorer. Values <= 0 exclude an option. */
  searchScorer?: SearchScorer;
  /** Highlight built-in label matches with <mark>. Default false. */
  highlightSearch?: boolean;
  /**
   * Hides results (showing a hint row instead) until the trimmed search
   * query reaches this length. Also delays ajax requests until the
   * threshold is met. Default 0 (no gate).
   */
  minSearchLength?: number;
  /**
   * Hides the search field when a local list contains fewer options than
   * this threshold. AJAX-backed lists always keep search visible. Default 0.
   */
  minResultsForSearch?: number;
  /**
   * Dynamically disables an option, in addition to its static `disabled`
   * field. Re-evaluated on every render, so it can react to external state
   * (e.g. a quota) without rebuilding `data` via setData().
   */
  isOptionDisabled?: (option: Option) => boolean;
  /**
   * false = never virtualize. true or unset = virtualize automatically
   * once the list exceeds ~100 rows.
   */
  virtualScroll?: boolean;
  /** Row height in px, or "auto" to measure variable-height rows. Default 36. */
  itemHeight?: number | "auto";
  language?: string | Record<string, string>;
  plugins?: ForgeSelectPlugin[];
  /**
   * Opens the dropdown when the control receives keyboard focus (e.g. via
   * Tab). Default false — focusing alone still requires Enter/Space/ArrowDown
   * to open, matching existing behavior.
   */
  openOnFocus?: boolean;
  /**
   * Optional portal container for the dropdown, useful inside overflow-hidden
   * modals and drawers. Accepts an element or selector. Default: the root.
   */
  dropdownParent?: HTMLElement | string;
}

export type ForgeSelectValue = string | string[] | null;

export interface SetValueOptions {
  /** Emit Forge Select's `change` event after updating. Default true. */
  emitChange?: boolean;
}

export interface SetSearchQueryOptions {
  /** Emit the `search` event. Default true. */
  emitSearch?: boolean;
}

/** Runtime-updateable options. Structural mode/plugin/portal changes still require remounting. */
export type ForgeSelectUpdateOptions = Omit<
  Partial<ForgeSelectOptions>,
  "multiple" | "searchable" | "plugins" | "dropdownParent"
>;

export interface MaximumSelectionEvent {
  limit: number;
  option: Option;
}

export interface ForgeSelectEventMap {
  change: ForgeSelectValue;
  open: void;
  close: void;
  search: string;
  clear: void;
  error: Error;
  loading: boolean;
  invalid: string;
  select: Option;
  unselect: Option;
  create: Option;
  reorder: string[];
  maximum: MaximumSelectionEvent;
}

export type ForgeSelectEvent = keyof ForgeSelectEventMap;
export type ForgeSelectEventHandler<E extends ForgeSelectEvent> = ForgeSelectEventMap[E] extends void
  ? () => void
  : (payload: ForgeSelectEventMap[E]) => void;
