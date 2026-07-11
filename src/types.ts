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
}

export interface OptionGroup {
  label: string;
  options: Option[];
}

export type DataItem = Option | OptionGroup;

export interface AjaxConfig {
  url: string | ((query: string) => string);
  params?: (query: string) => Record<string, unknown>;
  /** Debounce in milliseconds. Default 250. */
  debounce?: number;
  transform?: (response: unknown) => Option[];
}

export interface ForgeSelectPlugin {
  name: string;
  onInit?(select: ForgeSelect): void;
  onOpen?(select: ForgeSelect): void;
  onClose?(select: ForgeSelect): void;
  onDestroy?(select: ForgeSelect): void;
}

export type TemplateFn = (option: Option) => string | Node;

export interface ForgeSelectOptions {
  placeholder?: string;
  searchable?: boolean;
  multiple?: boolean;
  clearable?: boolean;
  allowCreate?: boolean;
  theme?: string;
  disabled?: boolean;
  data?: DataItem[];
  ajax?: AjaxConfig;
  templateResult?: TemplateFn;
  templateSelection?: TemplateFn;
  /**
   * true = always virtualize, false = never virtualize.
   * Unset = automatically virtualize once the list exceeds ~100 rows.
   */
  virtualScroll?: boolean;
  /** Row height in px used by the virtual scroller. Default 36; raise for rich items. */
  itemHeight?: number;
  language?: string | Record<string, string>;
  plugins?: ForgeSelectPlugin[];
}

export type ForgeSelectValue = string | string[] | null;

export type ForgeSelectEvent = "change" | "open" | "close" | "search" | "clear";
