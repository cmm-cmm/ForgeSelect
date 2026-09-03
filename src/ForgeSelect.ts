import { Emitter, type Handler } from "./emitter";
import { computeDropdownPlacement } from "./dropdown-position";
import { format, getStrings, type Strings } from "./i18n";
import { parseNativeOptions } from "./native-select";
import { renderOptionContent } from "./option-renderer";
import { buildUrl, normalizeRemoteResult } from "./remote";
import { RemoteCache } from "./remote-cache";
import { findNormalizedRanges, normalizeSearchText, SearchIndex } from "./search";
import {
  arraysEqual,
  collectDescendantValues,
  computeCheckState,
  isGroup,
  syncTreeAncestors as syncDataTreeAncestors,
} from "./selection";
import type {
  AjaxConfig,
  DataItem,
  ForgeSelectEvent,
  ForgeSelectEventHandler,
  ForgeSelectOptions,
  ForgeSelectUpdateOptions,
  ForgeSelectPlugin,
  ForgeSelectValue,
  Option,
  SetValueOptions,
  SetSearchQueryOptions,
  SearchField,
  SearchScorer,
  TemplateFn,
  TemplateSanitizer,
  SelectionGuard,
  CreateOption,
  MissingSelectionPolicy,
} from "./types";

type Row =
  | { kind: "group"; label: string }
  | { kind: "option"; option: Option; navIndex: number; depth: number; hasChildren: boolean; posInSet: number }
  | { kind: "create"; navIndex: number; posInSet: number }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "loading" }
  | { kind: "loading-more" }
  | { kind: "min-length" };

type NavItem = { kind: "option"; option: Option; parentValue?: string } | { kind: "create" };
type TagCreation = { option: Option; created: boolean };

interface ResolvedOptions {
  placeholder: string;
  searchable: boolean;
  multiple: boolean;
  clearable: boolean;
  allowCreate: boolean;
  sortable: boolean;
  closeOnSelect: boolean;
  maxSelections?: number;
  theme: string;
  disabled: boolean;
  required: boolean;
  data?: DataItem[];
  ajax?: AjaxConfig;
  templateResult?: TemplateFn;
  templateSelection?: TemplateFn;
  sanitizeTemplate?: TemplateSanitizer;
  beforeSelect?: SelectionGuard;
  beforeUnselect?: SelectionGuard;
  beforeCreate?: (label: string) => boolean;
  createOption?: CreateOption;
  missingSelectionPolicy: MissingSelectionPolicy;
  duplicateValuePolicy: "ignore" | "warn" | "error";
  filterOption?: (option: Option, query: string) => boolean;
  searchFields: SearchField[];
  tokenSearch: boolean;
  accentInsensitive: boolean;
  searchScorer?: SearchScorer;
  highlightSearch: boolean;
  minSearchLength: number;
  isOptionDisabled?: (option: Option) => boolean;
  minResultsForSearch: number;
  maxVisibleTags: number | undefined;
  virtualScroll: boolean | undefined;
  itemHeight: number;
  variableItemHeight: boolean;
  language: string | Record<string, string>;
  plugins: ForgeSelectPlugin[];
  openOnFocus: boolean;
  dropdownParent?: HTMLElement | string;
}

const DEFAULT_ITEM_HEIGHT = 36;
const VIRTUAL_BUFFER = 5;
const VIRTUAL_THRESHOLD = 100;
const ROW_CACHE_LIMIT = 2000;
const PAGE_SIZE = 10;
const TYPEAHEAD_RESET_MS = 500;

let uidCounter = 0;

export default class ForgeSelect {
  /** The original element ForgeSelect was mounted on. */
  readonly el: HTMLElement;

  private opts: ResolvedOptions;
  private strings: Strings;
  private data: DataItem[];
  private optionByValue = new Map<string, Option>();
  // Built on demand: only the allowCreate paths read it, and filling it eagerly
  // normalizes every label (NFD + regex) at construction for the majority of
  // selects that never create tags. rebuildOptionIndexes() nulls it, so every
  // existing invalidation point — including an accentInsensitive change —
  // already covers it.
  private optionByLabel: Map<string, Option> | null = null;
  // Whether any option in `data` has children, recorded by the walk
  // rebuildOptionIndexes() already does. buildRows() skips its subtree-match
  // cache when this is false, since a flat dataset visits every option exactly
  // once per pass. Only ever a speed hint: subtree matching is pure, so a stale
  // flag would recompute, never answer differently.
  private hasNestedOptions = false;
  private selected: string[] = [];
  private selectedOptions = new Map<string, Option>();
  private suppressNextTagClick = false;
  private emitter = new Emitter();
  private plugins: ForgeSelectPlugin[];

  private uid = `forge-select-${++uidCounter}`;
  private root!: HTMLDivElement;
  private control!: HTMLDivElement;
  private valueEl!: HTMLDivElement;
  private clearBtn!: HTMLButtonElement;
  private dropdown!: HTMLDivElement;
  private searchInput: HTMLInputElement | null = null;
  private list!: HTMLUListElement;
  private liveRegion!: HTMLDivElement;
  private portalHost: HTMLDivElement | null = null;

  private isOpen = false;
  private isDisabled = false;
  private destroyed = false;
  private query = "";
  private rows: Row[] = [];
  private navItems: NavItem[] = [];
  // Total number of role="option" rows the current query produces, including
  // ones virtual scrolling leaves out of the DOM. Reported as aria-setsize so
  // assistive tech describes the whole list rather than the rendered window.
  private rowSetSize = 0;
  private highlightedIndex = -1;
  private typeaheadBuffer = "";
  private typeaheadTimer: ReturnType<typeof setTimeout> | null = null;
  // Keyed by the option object, not its value: duplicateValuePolicy only warns
  // by default, so two options can share a value while carrying different
  // labels, and a value-keyed cache would render the first one's content for
  // both. Still explicitly bounded — a WeakMap would not collect anything while
  // `data` holds every key, so scrolling a long list would retain a detached
  // node per option visited.
  private rowContentCache = new Map<Option, Node>();
  private rowElementCache = new Map<string, HTMLLIElement>();
  private rowHeightCache = new Map<string, number>();
  private rowOffsetsCache: number[] | null = null;
  private scrollRafId: number | null = null;
  private ancestorScrollRafId: number | null = null;
  private searchIndex = new SearchIndex();
  private expandedValues = new Set<string>();

  private loading = false;
  private loadingMore = false;
  private page = 0;
  private hasMore = true;
  private ajaxTimer: ReturnType<typeof setTimeout> | null = null;
  private ajaxRequestId = 0;
  private ajaxController: AbortController | null = null;
  private remoteLoaded = false;
  private remoteCache = new RemoteCache<{ options: Option[]; hasMore: boolean; nextCursor?: string }>();
  private remoteInFlight = new Map<string, Promise<{ options: Option[]; hasMore: boolean; nextCursor?: string }>>();
  private nextCursor: string | undefined;
  private prefetchControllers = new Set<AbortController>();
  private loadError: Error | null = null;
  private originalDisplay = "";
  private originalDisabled = false;
  private nativeSelect: HTMLSelectElement | null = null;
  private nativeForm: HTMLFormElement | null = null;
  private syncingNative = false;

  /** Combines the static `disabled` field with the dynamic `isOptionDisabled` callback. */
  private isOptionDisabled = (option: Option): boolean =>
    option.disabled === true || (this.opts.isOptionDisabled?.(option) ?? false);

  private pointerDownOnControl = false;

  private onDocumentMouseDown = (event: MouseEvent): void => {
    const target = event.target as Node;
    if (!this.root.contains(target) && !this.portalHost?.contains(target)) this.close();
  };

  private onWindowResize = (): void => {
    this.positionDropdown();
  };

  private onAncestorScroll = (): void => {
    if (!this.portalHost) return;
    // Fires on every scroll anywhere in the document while a portaled
    // dropdown is open; coalesce to at most one reposition per frame.
    if (this.ancestorScrollRafId != null) return;
    this.ancestorScrollRafId = requestAnimationFrame(() => {
      this.ancestorScrollRafId = null;
      this.positionDropdown();
    });
  };

  private onNativeInvalid = (event: Event): void => {
    event.preventDefault();
    this.control.classList.add("forge-select__control--invalid");
    this.control.setAttribute("aria-invalid", "true");
    if (!this.isOpen) this.open();
    this.control.focus();
    this.emitter.emit("invalid", this.nativeSelect?.validationMessage ?? "");
  };

  private onNativeChange = (): void => {
    if (!this.nativeSelect || this.destroyed || this.syncingNative) return;
    const values = Array.from(this.nativeSelect.selectedOptions, (option) => option.value);
    this.applyNativeValues(values);
  };

  private applyNativeValues(values: string[]): void {
    this.replaceSelection(this.opts.multiple ? values : values.slice(0, 1));
    this.renderValue();
    if (this.isOpen) this.renderList();
    this.emitter.emit("change", this.getValue());
  }

  private onFormReset = (): void => {
    if (!this.nativeSelect || this.destroyed) return;
    const defaults = Array.from(this.nativeSelect.options)
      .filter((option) => option.defaultSelected)
      .map((option) => option.value);
    this.applyNativeValues(defaults);
  };

  constructor(target: string | HTMLElement, options: ForgeSelectOptions = {}) {
    const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
    if (!el) {
      throw new Error(`ForgeSelect: target element not found: ${String(target)}`);
    }
    this.el = el;

    const nativeSelect = el instanceof HTMLSelectElement ? el : null;
    this.nativeSelect = nativeSelect;
    this.nativeForm = nativeSelect?.form ?? null;
    this.originalDisplay = el.style.display;
    this.originalDisabled = nativeSelect?.disabled ?? false;
    this.opts = {
      placeholder: options.placeholder ?? "",
      searchable: options.searchable ?? true,
      multiple: options.multiple ?? nativeSelect?.multiple ?? false,
      clearable: options.clearable ?? false,
      allowCreate: options.allowCreate ?? false,
      sortable: options.sortable ?? false,
      closeOnSelect: options.closeOnSelect ?? false,
      maxSelections:
        options.maxSelections == null || !Number.isFinite(options.maxSelections)
          ? undefined
          : Math.max(0, Math.floor(options.maxSelections)),
      theme: options.theme ?? "default",
      disabled: options.disabled ?? nativeSelect?.disabled ?? false,
      required: options.required ?? nativeSelect?.required ?? false,
      data: options.data,
      ajax: options.ajax,
      templateResult: options.templateResult,
      templateSelection: options.templateSelection,
      sanitizeTemplate: options.sanitizeTemplate,
      beforeSelect: options.beforeSelect,
      beforeUnselect: options.beforeUnselect,
      beforeCreate: options.beforeCreate,
      createOption: options.createOption,
      missingSelectionPolicy: options.missingSelectionPolicy ?? "preserve",
      duplicateValuePolicy: options.duplicateValuePolicy ?? "warn",
      filterOption: options.filterOption,
      searchFields: options.searchFields ?? ["label", "description"],
      tokenSearch: options.tokenSearch ?? true,
      accentInsensitive: options.accentInsensitive ?? true,
      searchScorer: options.searchScorer,
      highlightSearch: options.highlightSearch ?? false,
      minSearchLength: Math.max(0, Math.floor(options.minSearchLength ?? 0)),
      minResultsForSearch: Math.max(0, Math.floor(options.minResultsForSearch ?? 0)),
      maxVisibleTags:
        options.maxVisibleTags == null || !Number.isFinite(options.maxVisibleTags)
          ? undefined
          : Math.max(0, Math.floor(options.maxVisibleTags)),
      isOptionDisabled: options.isOptionDisabled,
      virtualScroll: options.virtualScroll,
      itemHeight: typeof options.itemHeight === "number" ? Math.max(1, options.itemHeight) : DEFAULT_ITEM_HEIGHT,
      variableItemHeight: options.itemHeight === "auto",
      language: options.language ?? "en",
      plugins: options.plugins ?? [],
      openOnFocus: options.openOnFocus ?? false,
      dropdownParent: options.dropdownParent,
    };
    this.strings = getStrings(this.opts.language);
    this.plugins = this.opts.plugins;
    if (nativeSelect) nativeSelect.required = this.opts.required;

    // Copied, not aliased: allowCreate appends to `this.data`, and writing that
    // into the array the caller handed us mutates their own state from the
    // outside — invisible to React (same array reference, so no re-render) and
    // visible in the wrong way to Vue (a deep watcher on the options prop fires
    // straight back into updateOptions). The Option objects stay shared, which
    // is required: rowContentCache and SearchIndex are keyed by object identity.
    this.data = this.opts.data ? [...this.opts.data] : nativeSelect ? parseNativeOptions(nativeSelect) : [];
    this.rebuildOptionIndexes();
    if (nativeSelect && !this.opts.data) {
      const nativeOptions = Array.from(nativeSelect.options);
      const hasIntentionalSelection =
        nativeSelect.multiple ||
        nativeSelect.selectedIndex > 0 ||
        nativeOptions.some((option) => option.defaultSelected);
      if (hasIntentionalSelection) {
        this.replaceSelection(nativeOptions.filter((option) => option.selected).map((option) => option.value));
      }
    }

    this.buildDom();
    this.renderValue();
    if (this.opts.disabled) this.disable();
    nativeSelect?.addEventListener("change", this.onNativeChange);
    nativeSelect?.addEventListener("invalid", this.onNativeInvalid);
    this.nativeForm?.addEventListener("reset", this.onFormReset);

    for (const plugin of this.plugins) plugin.onInit?.(this);
    for (const query of this.opts.ajax?.prefetch ?? []) void this.prefetchRemote(query);
  }

  // ---------------------------------------------------------------- public API

  open(): void {
    if (this.isOpen || this.isDisabled || this.destroyed) return;
    this.isOpen = true;
    this.dropdown.hidden = false;
    this.root.classList.add("forge-select--open");
    this.control.setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", this.onDocumentMouseDown);

    if (this.opts.ajax && (this.opts.ajax.loadOnOpen ?? true) && !this.remoteLoaded) {
      this.scheduleRemoteLoad(this.query, 0);
    }
    // allowCreate consults the label index on every keystroke to decide whether
    // to offer a "create" row. Fill it here rather than on that first keystroke,
    // where the user is waiting on the result.
    if (this.opts.allowCreate) this.labelIndex();
    this.renderList();
    this.positionDropdown();
    window.addEventListener("resize", this.onWindowResize);
    window.visualViewport?.addEventListener("resize", this.onWindowResize);
    window.visualViewport?.addEventListener("scroll", this.onWindowResize);
    document.addEventListener("scroll", this.onAncestorScroll, true);
    if (this.searchInput && !this.searchInput.hidden) this.searchInput.focus();

    this.emitter.emit("open");
    for (const plugin of this.plugins) plugin.onOpen?.(this);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dropdown.hidden = true;
    this.root.classList.remove("forge-select--open");
    this.root.classList.remove("forge-select--drop-up");
    this.control.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", this.onDocumentMouseDown);
    window.removeEventListener("resize", this.onWindowResize);
    window.visualViewport?.removeEventListener("resize", this.onWindowResize);
    window.visualViewport?.removeEventListener("scroll", this.onWindowResize);
    document.removeEventListener("scroll", this.onAncestorScroll, true);
    if (this.ancestorScrollRafId != null) {
      cancelAnimationFrame(this.ancestorScrollRafId);
      this.ancestorScrollRafId = null;
    }
    if (this.scrollRafId != null) {
      cancelAnimationFrame(this.scrollRafId);
      this.scrollRafId = null;
    }
    if (this.typeaheadTimer) {
      clearTimeout(this.typeaheadTimer);
      this.typeaheadTimer = null;
    }
    this.typeaheadBuffer = "";
    this.highlightedIndex = -1;
    // The dropdown is only hidden, not re-rendered, so the highlighted row and
    // its id survive the close. Dropping the reference here keeps a collapsed
    // combobox (aria-expanded="false") from still naming an active option.
    this.updateActiveDescendant();
    // Not gated on `this.searchInput` existing: a searchable: false select with
    // ajax can still carry a non-empty `query` set programmatically through
    // setSearchQuery(), and that query must be retired on close the same way a
    // typed one is, or reopening reproduces the exact stale-filtered-page bug
    // this block exists to prevent.
    const hadQuery = this.query !== "";
    if (this.searchInput) this.searchInput.value = "";
    this.query = "";
    // A remote list holds the page fetched for the query just cleared, so
    // reopening would show a filtered list under an empty search box. Local
    // lists re-filter their own `data` on the next render and need nothing.
    // The remote cache normally serves the refetch without a new request.
    if (hadQuery && this.opts.ajax) {
      // Retire the request the cleared query belongs to as well. Left running,
      // it would land its filtered page and set remoteLoaded, so the reopen
      // would skip the empty-query load and show exactly the stale rows this
      // is meant to prevent.
      this.ajaxRequestId += 1;
      if (this.ajaxTimer) {
        clearTimeout(this.ajaxTimer);
        this.ajaxTimer = null;
      }
      this.ajaxController?.abort();
      this.ajaxController = null;
      this.setLoading(false);
      this.loadingMore = false;
      this.remoteLoaded = false;
    }

    this.emitter.emit("close");
    for (const plugin of this.plugins) plugin.onClose?.(this);
  }

  /**
   * Flips the dropdown above the control when there isn't enough room below
   * but there is above. Recomputed on open() and on window resize — the
   * dropdown is positioned absolutely inside the relatively-positioned root,
   * so it already tracks the control correctly on page scroll without
   * needing a scroll listener.
   */
  private positionDropdown(): void {
    const controlRect = this.control.getBoundingClientRect();
    const viewport = window.visualViewport;
    const placement = computeDropdownPlacement(
      controlRect,
      this.dropdown.offsetHeight,
      viewport?.height ?? window.innerHeight,
    );
    this.root.classList.toggle("forge-select--drop-up", placement.dropUp);
    if (this.portalHost) {
      this.portalHost.style.top = `${placement.top + (viewport?.offsetTop ?? 0)}px`;
      this.portalHost.style.left = `${controlRect.left + (viewport?.offsetLeft ?? 0)}px`;
      this.portalHost.style.width = `${controlRect.width}px`;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.close();
    for (const plugin of this.plugins) plugin.onDestroy?.(this);
    this.destroyed = true;
    if (this.ajaxTimer) clearTimeout(this.ajaxTimer);
    this.ajaxController?.abort();
    for (const controller of this.prefetchControllers) controller.abort();
    this.prefetchControllers.clear();
    this.remoteInFlight.clear();
    if (this.scrollRafId != null) cancelAnimationFrame(this.scrollRafId);
    if (this.typeaheadTimer) clearTimeout(this.typeaheadTimer);
    this.nativeSelect?.removeEventListener("change", this.onNativeChange);
    this.nativeSelect?.removeEventListener("invalid", this.onNativeInvalid);
    this.nativeForm?.removeEventListener("reset", this.onFormReset);
    this.clearRowCaches();
    this.searchIndex.clear();
    this.portalHost?.remove();
    this.root.remove();
    this.el.style.display = this.originalDisplay;
    if (this.nativeSelect) this.nativeSelect.disabled = this.originalDisabled;
    this.emitter.clear();
  }

  getValue(): ForgeSelectValue {
    if (this.opts.multiple) return [...this.selected];
    return this.selected[0] ?? null;
  }

  getSearchQuery(): string {
    return this.query;
  }

  setSearchQuery(query: string, options: SetSearchQueryOptions = {}): void {
    this.applySearchQuery(query, options.emitSearch ?? true);
  }

  isDropdownOpen(): boolean {
    return this.isOpen;
  }

  updateOptions(options: ForgeSelectUpdateOptions): void {
    if (options.data) this.setData(options.data);
    if ("ajax" in options && options.ajax !== this.opts.ajax) {
      this.opts.ajax = options.ajax;
      this.remoteLoaded = false;
      this.clearRemoteCache();
    }
    if (options.placeholder !== undefined) this.opts.placeholder = options.placeholder;
    if (options.clearable !== undefined) this.opts.clearable = options.clearable;
    if (options.allowCreate !== undefined) this.opts.allowCreate = options.allowCreate;
    if (options.sortable !== undefined) this.opts.sortable = options.sortable;
    if (options.closeOnSelect !== undefined) this.opts.closeOnSelect = options.closeOnSelect;
    if ("maxSelections" in options)
      this.opts.maxSelections =
        options.maxSelections == null || !Number.isFinite(options.maxSelections)
          ? undefined
          : Math.max(0, Math.floor(options.maxSelections));
    if (options.theme !== undefined) {
      this.opts.theme = options.theme;
      this.root.dataset.theme = options.theme;
      if (this.portalHost) this.portalHost.dataset.theme = options.theme;
    }
    if (options.required !== undefined) {
      this.opts.required = options.required;
      if (options.required) this.control.setAttribute("aria-required", "true");
      else this.control.removeAttribute("aria-required");
      if (this.nativeSelect) this.nativeSelect.required = options.required;
    }
    if (options.templateResult !== undefined) this.opts.templateResult = options.templateResult;
    if (options.templateSelection !== undefined) this.opts.templateSelection = options.templateSelection;
    if (options.sanitizeTemplate !== undefined) this.opts.sanitizeTemplate = options.sanitizeTemplate;
    if (options.beforeSelect !== undefined) this.opts.beforeSelect = options.beforeSelect;
    if (options.beforeUnselect !== undefined) this.opts.beforeUnselect = options.beforeUnselect;
    if (options.beforeCreate !== undefined) this.opts.beforeCreate = options.beforeCreate;
    if (options.createOption !== undefined) this.opts.createOption = options.createOption;
    if (options.missingSelectionPolicy !== undefined) this.opts.missingSelectionPolicy = options.missingSelectionPolicy;
    let needsReindex = false;
    if (options.duplicateValuePolicy !== undefined) {
      this.opts.duplicateValuePolicy = options.duplicateValuePolicy;
      needsReindex = true;
    }
    if (options.filterOption !== undefined) this.opts.filterOption = options.filterOption;
    if (options.searchFields !== undefined) this.opts.searchFields = options.searchFields;
    if (options.tokenSearch !== undefined) this.opts.tokenSearch = options.tokenSearch;
    if (options.accentInsensitive !== undefined) {
      this.opts.accentInsensitive = options.accentInsensitive;
      needsReindex = true;
    }
    if (options.searchScorer !== undefined) this.opts.searchScorer = options.searchScorer;
    if (options.highlightSearch !== undefined) this.opts.highlightSearch = options.highlightSearch;
    if (options.minSearchLength !== undefined)
      this.opts.minSearchLength = Math.max(0, Math.floor(options.minSearchLength));
    if (options.minResultsForSearch !== undefined)
      this.opts.minResultsForSearch = Math.max(0, Math.floor(options.minResultsForSearch));
    if (options.maxVisibleTags !== undefined)
      this.opts.maxVisibleTags = Number.isFinite(options.maxVisibleTags)
        ? Math.max(0, Math.floor(options.maxVisibleTags))
        : undefined;
    if (options.isOptionDisabled !== undefined) this.opts.isOptionDisabled = options.isOptionDisabled;
    if (options.virtualScroll !== undefined) this.opts.virtualScroll = options.virtualScroll;
    if (options.itemHeight !== undefined) {
      this.opts.variableItemHeight = options.itemHeight === "auto";
      if (typeof options.itemHeight === "number") this.opts.itemHeight = Math.max(1, options.itemHeight);
      this.root.style.setProperty("--fs-item-height", `${this.opts.itemHeight}px`);
      this.portalHost?.style.setProperty("--fs-item-height", `${this.opts.itemHeight}px`);
    }
    if (options.language !== undefined) {
      this.opts.language = options.language;
      this.strings = getStrings(options.language);
      this.clearBtn.setAttribute("aria-label", this.strings.clearSelection);
      this.searchInput?.setAttribute("aria-label", this.strings.search);
    }
    if (options.openOnFocus !== undefined) this.opts.openOnFocus = options.openOnFocus;
    if (options.disabled !== undefined) {
      if (options.disabled) this.disable();
      else this.enable();
    }
    // Deferred to the end and deduped: every plain field assignment above must
    // land first, so a duplicateValuePolicy: "error" throw here (on data that
    // already has duplicates) only skips the trailing render refresh below —
    // opts already fully reflects this call — instead of aborting mid-update
    // and leaving later options in this same call unapplied.
    if (needsReindex) this.rebuildOptionIndexes();
    this.root.classList.toggle("forge-select--sortable", this.opts.sortable && this.opts.multiple);
    this.updateSearchVisibility();
    this.clearRowCaches();
    this.searchIndex.clear();
    this.renderValue();
    if (this.isOpen) this.renderList();
  }

  validate(): boolean {
    const valid =
      (!this.opts.required || this.selected.length > 0) && (this.control.dataset.validationMessage ?? "") === "";
    this.control.classList.toggle("forge-select__control--invalid", !valid);
    this.control.setAttribute("aria-invalid", String(!valid));
    return valid;
  }

  setCustomValidity(message: string): void {
    this.nativeSelect?.setCustomValidity(message);
    this.control.dataset.validationMessage = message;
  }

  reportValidity(): boolean {
    const valid = this.validate() && (this.nativeSelect?.checkValidity() ?? true);
    if (!valid) {
      const message = this.nativeSelect?.validationMessage ?? this.control.dataset.validationMessage ?? "";
      if (this.nativeSelect) return this.nativeSelect.reportValidity();
      this.emitter.emit("invalid", message);
    }
    return valid;
  }

  reload(): void {
    if (!this.opts.ajax) return;
    this.clearRemoteCache();
    this.remoteLoaded = false;
    this.scheduleRemoteLoad(this.query, 0);
  }

  clearRemoteCache(): void {
    this.remoteCache.clear();
    this.remoteInFlight.clear();
  }

  setValue(value: ForgeSelectValue, options: SetValueOptions = {}): void {
    const values = value == null ? [] : Array.isArray(value) ? value : [value];
    const next = this.opts.multiple ? values : values.slice(0, 1);
    if (arraysEqual(next, this.selected)) return;
    this.replaceSelection(next);
    this.afterSelectionChange(options.emitChange ?? true);
  }

  /**
   * Replaces the option list after construction. An open dropdown re-renders
   * immediately; a selection whose value isn't in the new data stays
   * selected (rendered via the already-selected option's own label/avatar,
   * the same fallback used for values selected from a stale ajax page).
   */
  setData(data: DataItem[]): void {
    const previousData = this.data;
    // Copied for the same reason as in the constructor — see the note there.
    this.data = [...data];
    try {
      this.rebuildOptionIndexes();
    } catch (error) {
      this.data = previousData;
      this.rebuildOptionIndexes();
      throw error;
    }
    const missing = this.selected.filter((value) => !this.optionByValue.has(value));
    if (missing.length > 0 && this.opts.missingSelectionPolicy === "error") {
      this.data = previousData;
      this.rebuildOptionIndexes();
      throw new Error(`ForgeSelect: setData() is missing selected value(s): ${missing.join(", ")}`);
    }
    // Only committed once the new data is known to be acceptable — a validation
    // failure above must not silently cancel an in-flight remote load or reset
    // pagination state that the caller, having just received an exception, has
    // no way to detect or undo.
    if (this.ajaxTimer) {
      clearTimeout(this.ajaxTimer);
      this.ajaxTimer = null;
    }
    this.ajaxController?.abort();
    this.ajaxController = null;
    this.ajaxRequestId += 1;
    this.setLoading(false);
    this.loadingMore = false;
    this.loadError = null;
    this.remoteLoaded = true;
    this.page = 0;
    this.hasMore = false;
    this.nextCursor = undefined;
    // Points at the internal copy, so a later read of opts.data can't hand
    // back an array the caller may have mutated since.
    this.opts.data = this.data;
    if (missing.length > 0 && this.opts.missingSelectionPolicy === "prune") {
      this.selected = this.selected.filter((value) => this.optionByValue.has(value));
      this.afterSelectionChange();
    }
    this.updateSearchVisibility();
    this.clearRowCaches();
    this.searchIndex.clear();
    this.highlightedIndex = -1;
    if (this.isOpen) this.renderList();
  }

  /**
   * Multi-select only: selects every currently non-disabled option, including
   * nested tree descendants and options inside groups. If `maxSelections` is
   * set, stops once the cap is reached rather than exceeding it. A no-op for
   * single-select.
   */
  selectAll(): void {
    if (!this.opts.multiple) return;
    if (this.opts.maxSelections == null) {
      this.replaceSelection(this.allSelectableValues());
      this.afterSelectionChange();
      return;
    }
    // Capped lists keep the incremental path: canSelectOption() has to weigh
    // each candidate (plus its cascaded descendants and resynced ancestors)
    // against the running total, which a single bulk pass can't express. The
    // cost stays bounded because the loop stops at the cap — once the selection
    // reaches it, every remaining candidate would project past it anyway.
    this.selected = [];
    for (const value of this.allSelectableValues()) {
      if (this.hasReachedMaximum()) break;
      const option = this.findOption(value);
      if (option && this.canSelectOption(option)) this.selectValue(value, false);
    }
    this.afterSelectionChange();
  }

  /** Clears every selection. Equivalent to `setValue(null)`. */
  clearAll(): void {
    this.clearSelection();
  }

  enable(): void {
    this.isDisabled = false;
    this.root.classList.remove("forge-select--disabled");
    this.control.tabIndex = 0;
    this.control.setAttribute("aria-disabled", "false");
    if (this.nativeSelect) this.nativeSelect.disabled = false;
  }

  disable(): void {
    this.close();
    this.isDisabled = true;
    this.root.classList.add("forge-select--disabled");
    this.control.tabIndex = -1;
    this.control.setAttribute("aria-disabled", "true");
    if (this.nativeSelect) this.nativeSelect.disabled = true;
  }

  on<E extends ForgeSelectEvent>(event: E, handler: ForgeSelectEventHandler<E>): void {
    this.emitter.on(event, handler as Handler);
  }

  off<E extends ForgeSelectEvent>(event: E, handler: ForgeSelectEventHandler<E>): void {
    this.emitter.off(event, handler as Handler);
  }

  // ---------------------------------------------------------------- DOM setup

  /**
   * The original target (a hidden native <select> or a plain mount div) can
   * carry an accessible name via aria-label/aria-labelledby, or via a
   * <label for> pointing at its id — but once `this.el` is display:none it
   * drops out of the accessibility tree, so any such association silently
   * stops reaching assistive tech unless we forward it onto the visible,
   * interactive `this.control` ourselves.
   */
  private applyAccessibleName(): void {
    const ariaLabelledby = this.el.getAttribute("aria-labelledby");
    const ariaLabel = this.el.getAttribute("aria-label");
    if (ariaLabelledby) {
      this.control.setAttribute("aria-labelledby", ariaLabelledby);
    } else if (ariaLabel) {
      this.control.setAttribute("aria-label", ariaLabel);
    } else if (this.el.id) {
      const label = Array.from(document.getElementsByTagName("label")).find((el) => el.htmlFor === this.el.id);
      if (label) {
        if (!label.id) label.id = `${this.uid}-label`;
        this.control.setAttribute("aria-labelledby", label.id);
      }
    }
  }

  private shouldShowSearch(): boolean {
    // optionByValue rather than collectValues(this.data): both dedupe by value
    // over the same walk, so the counts are identical, but the index is already
    // built. Counting through a throwaway Set walked the whole dataset on every
    // construction and every data change, to compare against a threshold in the
    // tens. rebuildOptionIndexes() runs before buildDom() and before each
    // updateSearchVisibility(), so the size read here is never stale.
    return this.opts.searchable && (this.opts.ajax != null || this.optionByValue.size >= this.opts.minResultsForSearch);
  }

  private updateSearchVisibility(): void {
    if (!this.searchInput) return;
    this.searchInput.hidden = !this.shouldShowSearch();
    if (this.searchInput.hidden) {
      this.searchInput.value = "";
      this.query = "";
    }
  }

  private buildDom(): void {
    const portalParent =
      typeof this.opts.dropdownParent === "string"
        ? document.querySelector<HTMLElement>(this.opts.dropdownParent)
        : this.opts.dropdownParent;
    if (this.opts.dropdownParent && !portalParent) {
      throw new Error(`ForgeSelect: dropdown parent not found: ${String(this.opts.dropdownParent)}`);
    }
    this.root = document.createElement("div");
    this.root.className = "forge-select";
    this.root.dataset.theme = this.opts.theme;
    this.root.style.setProperty("--fs-item-height", `${this.opts.itemHeight}px`);
    if (this.opts.sortable && this.opts.multiple) this.root.classList.add("forge-select--sortable");

    this.control = document.createElement("div");
    this.control.className = "forge-select__control";
    this.control.setAttribute("role", "combobox");
    this.control.setAttribute("aria-haspopup", "listbox");
    this.control.setAttribute("aria-expanded", "false");
    this.control.setAttribute("aria-controls", `${this.uid}-list`);
    if (this.opts.required) this.control.setAttribute("aria-required", "true");
    this.control.tabIndex = 0;
    this.applyAccessibleName();

    this.valueEl = document.createElement("div");
    this.valueEl.className = "forge-select__value";

    this.clearBtn = document.createElement("button");
    this.clearBtn.type = "button";
    this.clearBtn.className = "forge-select__clear";
    this.clearBtn.setAttribute("aria-label", this.strings.clearSelection);
    this.clearBtn.textContent = "×";
    this.clearBtn.hidden = true;

    const arrow = document.createElement("span");
    arrow.className = "forge-select__arrow";
    arrow.setAttribute("aria-hidden", "true");

    this.control.append(this.valueEl, this.clearBtn, arrow);

    this.dropdown = document.createElement("div");
    this.dropdown.className = "forge-select__dropdown";
    this.dropdown.hidden = true;

    if (this.opts.searchable) {
      this.searchInput = document.createElement("input");
      this.searchInput.type = "search";
      this.searchInput.className = "forge-select__search";
      this.searchInput.setAttribute("aria-label", this.strings.search);
      this.searchInput.setAttribute("aria-autocomplete", "list");
      this.searchInput.setAttribute("aria-controls", `${this.uid}-list`);
      this.searchInput.hidden = !this.shouldShowSearch();
      this.dropdown.append(this.searchInput);
    }

    this.list = document.createElement("ul");
    this.list.className = "forge-select__list";
    this.list.id = `${this.uid}-list`;
    this.list.setAttribute("role", "listbox");
    if (this.opts.multiple) this.list.setAttribute("aria-multiselectable", "true");
    this.dropdown.append(this.list);

    this.liveRegion = document.createElement("div");
    this.liveRegion.className = "forge-select__sr-only";
    this.liveRegion.setAttribute("role", "status");
    this.liveRegion.setAttribute("aria-live", "polite");

    this.root.append(this.control, this.liveRegion);
    if (!portalParent) this.root.append(this.dropdown);
    this.el.style.display = "none";
    this.el.insertAdjacentElement("afterend", this.root);

    if (portalParent) {
      this.portalHost = document.createElement("div");
      this.portalHost.className = "forge-select forge-select--portal-host";
      this.portalHost.style.direction = getComputedStyle(this.root).direction;
      this.portalHost.dataset.theme = this.opts.theme;
      this.portalHost.style.setProperty("--fs-item-height", `${this.opts.itemHeight}px`);
      this.portalHost.append(this.dropdown);
      portalParent.append(this.portalHost);
    }

    this.bindEvents();
  }

  private bindEvents(): void {
    this.control.addEventListener("click", (event) => {
      if (event.target === this.clearBtn) return;
      if (this.suppressNextTagClick) {
        this.suppressNextTagClick = false;
        return;
      }
      if (this.isDisabled) return;
      if (this.isOpen) this.close();
      else this.open();
    });

    this.control.addEventListener("keydown", (event) => this.handleKeydown(event));

    // A mouse click fires mousedown -> focus -> click, in that order. Without
    // tracking pointerDownOnControl, openOnFocus would open the dropdown
    // during the focus phase, and the click handler above would then
    // immediately close it again via its own open/close toggle. Tracking
    // whether a mousedown preceded this focus distinguishes "focused via
    // mouse click" (skip auto-open, let the click handler's toggle run) from
    // "focused via keyboard Tab" (auto-open).
    this.control.addEventListener("mousedown", () => {
      this.pointerDownOnControl = true;
    });
    this.control.addEventListener("focus", () => {
      if (this.opts.openOnFocus && !this.pointerDownOnControl && !this.isOpen && !this.isDisabled) {
        this.open();
      }
      this.pointerDownOnControl = false;
    });

    this.clearBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (
        this.selected.some((value) => {
          const option = this.findOption(value) ?? this.selectedOptions.get(value) ?? { value, label: value };
          return this.opts.beforeUnselect?.(option) === false;
        })
      )
        return;
      this.clearSelection();
    });

    if (this.searchInput) {
      let composing = false;
      this.searchInput.addEventListener("compositionstart", () => {
        composing = true;
      });
      this.searchInput.addEventListener("compositionend", () => {
        composing = false;
        this.applySearchQuery(this.searchInput!.value, true);
      });
      this.searchInput.addEventListener("input", () => {
        if (composing) return;
        this.applySearchQuery(this.searchInput!.value, true);
      });
      this.searchInput.addEventListener("keydown", (event) => this.handleKeydown(event));
      this.searchInput.addEventListener("paste", (event) => {
        if (!this.opts.multiple || !this.opts.allowCreate) return;
        const text = event.clipboardData?.getData("text") ?? "";
        const labels = text
          .split(/[,\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (labels.length < 2) return;
        event.preventDefault();
        void Promise.all(labels.map((label) => this.createTag(label)))
          .then((results) => {
            const created = results.filter((result): result is TagCreation => result !== undefined);
            if (created.length === 0 || this.destroyed) return;
            this.searchInput!.value = "";
            this.query = "";
            this.afterSelectionChange();
            for (const result of created) {
              if (result.created) this.emitter.emit("create", result.option);
              this.emitter.emit("select", result.option);
            }
            if (this.opts.closeOnSelect) this.close();
            else this.renderList();
          })
          .catch((cause: unknown) => {
            const error = cause instanceof Error ? cause : new Error(String(cause));
            this.emitter.emit("error", error);
          });
      });
    }

    this.list.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const twisty = target.closest<HTMLElement>("[data-twisty]");
      if (twisty) {
        const value = twisty.dataset.twisty!;
        if (this.expandedValues.has(value)) this.expandedValues.delete(value);
        else this.expandedValues.add(value);
        this.renderList();
        return;
      }
      const li = target.closest<HTMLLIElement>("li[data-nav-index]");
      if (!li) {
        const optionRow = target.closest<HTMLLIElement>("li[data-option-value]");
        const option = optionRow ? this.findOption(optionRow.dataset.optionValue!) : undefined;
        if (option && this.hasReachedMaximum() && !this.selected.includes(option.value)) this.announceMaximum(option);
        return;
      }
      const navIndex = Number(li.dataset.navIndex);
      this.activateNavItem(navIndex);
    });

    this.list.addEventListener("scroll", () => {
      // Coalesce rapid native scroll events (momentum scrolling can fire more
      // of these than there are animation frames) into one render per frame.
      if (this.scrollRafId != null) return;
      this.scrollRafId = requestAnimationFrame(() => {
        this.scrollRafId = null;
        if (this.usesVirtualScroll()) this.renderRows();
        this.maybeLoadNextPage();
      });
    });
  }

  private applySearchQuery(query: string, emitSearch: boolean): void {
    this.query = query;
    if (this.searchInput && this.searchInput.value !== query) this.searchInput.value = query;
    this.highlightedIndex = -1;
    this.list.scrollTop = 0;
    if (emitSearch) this.emitter.emit("search", query);
    const trimmed = query.trim();
    const belowMinLength = trimmed !== "" && trimmed.length < this.opts.minSearchLength;
    if (this.opts.ajax && !belowMinLength) {
      this.scheduleRemoteLoad(query, this.opts.ajax.debounce ?? 250);
      return;
    }
    if (belowMinLength) {
      if (this.ajaxTimer) {
        clearTimeout(this.ajaxTimer);
        this.ajaxTimer = null;
      }
      this.ajaxController?.abort();
      this.setLoading(false);
    }
    this.renderList();
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (this.isDisabled || event.isComposing || event.keyCode === 229) return;
    switch (event.key) {
      case "Enter":
        event.preventDefault();
        if (!this.isOpen) this.open();
        else if (this.highlightedIndex >= 0) this.activateNavItem(this.highlightedIndex);
        break;
      case " ":
        if (event.target === this.control) {
          event.preventDefault();
          if (!this.isOpen) this.open();
        }
        break;
      case "ArrowDown":
        event.preventDefault();
        if (!this.isOpen) this.open();
        else this.moveHighlight(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (this.isOpen) this.moveHighlight(-1);
        break;
      case "Escape":
        if (this.isOpen) {
          event.preventDefault();
          this.close();
          this.control.focus();
        }
        break;
      case "ArrowRight":
        if (this.isOpen && this.navigateTree("right")) event.preventDefault();
        break;
      case "ArrowLeft":
        if (this.isOpen && this.navigateTree("left")) event.preventDefault();
        break;
      case "Home":
        if (this.isOpen) {
          event.preventDefault();
          this.focusNavIndex(0);
        }
        break;
      case "End":
        if (this.isOpen) {
          event.preventDefault();
          this.focusNavIndex(this.navItems.length - 1);
        }
        break;
      case "PageDown":
        if (this.isOpen) {
          event.preventDefault();
          this.focusNavIndex(
            Math.min(this.navItems.length - 1, (this.highlightedIndex === -1 ? 0 : this.highlightedIndex) + PAGE_SIZE),
          );
        }
        break;
      case "PageUp":
        if (this.isOpen) {
          event.preventDefault();
          this.focusNavIndex(Math.max(0, (this.highlightedIndex === -1 ? 0 : this.highlightedIndex) - PAGE_SIZE));
        }
        break;
      case "Tab":
        this.close();
        break;
      default:
        if (
          this.isOpen &&
          event.target === this.control &&
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          this.handleTypeahead(event.key);
        }
        break;
    }
  }

  /**
   * Jumps the highlight to the next nav item (wrapping) whose label starts
   * with the accumulated buffer, matching native <select> typeahead: rapid
   * distinct keystrokes narrow the prefix, a pause resets it.
   */
  private handleTypeahead(char: string): void {
    if (this.typeaheadTimer) clearTimeout(this.typeaheadTimer);
    this.typeaheadBuffer += normalizeSearchText(char, this.opts.accentInsensitive);
    this.typeaheadTimer = setTimeout(() => {
      this.typeaheadBuffer = "";
      this.typeaheadTimer = null;
    }, TYPEAHEAD_RESET_MS);
    const prefix = [...this.typeaheadBuffer].every((value) => value === this.typeaheadBuffer[0])
      ? this.typeaheadBuffer[0]
      : this.typeaheadBuffer;
    const count = this.navItems.length;
    for (let step = 1; step <= count; step += 1) {
      const index = (this.highlightedIndex + step + count) % count;
      const item = this.navItems[index];
      if (
        item.kind === "option" &&
        normalizeSearchText(item.option.label, this.opts.accentInsensitive).startsWith(prefix)
      ) {
        this.focusNavIndex(index);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- selection

  private canSelectOption(option: Option): boolean {
    if (this.opts.maxSelections == null) return true;
    const projected = [...this.selected];
    if (!projected.includes(option.value)) projected.push(option.value);
    for (const value of collectDescendantValues(option, this.isOptionDisabled)) {
      if (!projected.includes(value)) projected.push(value);
    }
    syncDataTreeAncestors(this.data, projected, this.isOptionDisabled);
    return projected.length <= this.opts.maxSelections;
  }

  private hasReachedMaximum(): boolean {
    return this.opts.maxSelections != null && this.selected.length >= this.opts.maxSelections;
  }

  private announceMaximum(option: Option): void {
    const limit = this.opts.maxSelections;
    if (limit == null) return;
    this.liveRegion.textContent = format(this.strings.maximumSelected, { count: String(limit) });
    this.emitter.emit("maximum", { limit, option });
  }

  /**
   * Replaces the whole selection in one pass, applying the same cascade and
   * ancestor rules selectValue() does.
   *
   * selectValue() costs O(n) per call — a linear `includes` scan of the current
   * selection, plus a syncTreeAncestors() walk of the entire dataset — which is
   * the right trade for the one-value-at-a-time interactive paths it serves.
   * Driving it from a loop made the bulk entry points quadratic: setValue() with
   * 8,000 values blocked the main thread for ~0.9s (70/137/305/886ms at
   * 1k/2k/4k/8k). Here membership is a Set, and the tree sync runs once at the
   * end — all it ever needed, since it recomputes every ancestor from the
   * finished selection rather than accumulating across calls.
   *
   * Callers pass an already-sliced list for single-select; the `break` below
   * only re-states that, matching selectValue()'s `this.selected = [value]`.
   */
  private replaceSelection(values: Iterable<string>, accept?: (option: Option) => boolean): void {
    const next: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) continue;
      const option = this.findOption(value) ?? this.selectedOptions.get(value) ?? { value, label: value };
      if (accept && !accept(option)) continue;
      this.selectedOptions.set(value, option);
      seen.add(value);
      next.push(value);
      if (!this.opts.multiple) break;
      for (const descendant of collectDescendantValues(option, this.isOptionDisabled)) {
        if (seen.has(descendant)) continue;
        seen.add(descendant);
        next.push(descendant);
      }
    }
    this.selected = next;
    if (this.opts.multiple) this.syncTreeAncestors();
  }

  private selectValue(value: string, notify: boolean): void {
    if (this.selected.includes(value)) return;
    const option = this.findOption(value) ?? this.selectedOptions.get(value) ?? { value, label: value };
    this.selectedOptions.set(value, option);
    if (this.opts.multiple) {
      this.selected.push(value);
      // Selecting a tree node cascades to its descendants too; for a plain
      // option (no children) this is a no-op.
      for (const v of collectDescendantValues(option, this.isOptionDisabled)) {
        if (!this.selected.includes(v)) this.selected.push(v);
      }
      this.syncTreeAncestors();
    } else {
      this.selected = [value];
    }
    if (notify) {
      this.afterSelectionChange();
      this.emitter.emit("select", option);
    }
  }

  private deselectValue(value: string, notify: boolean): void {
    const index = this.selected.indexOf(value);
    if (index === -1) return;
    const option = this.findOption(value) ?? this.selectedOptions.get(value);
    this.selected.splice(index, 1);
    if (this.opts.multiple) {
      if (option) {
        for (const v of collectDescendantValues(option, this.isOptionDisabled)) {
          const i = this.selected.indexOf(v);
          if (i !== -1) this.selected.splice(i, 1);
        }
      }
      this.syncTreeAncestors();
    }
    if (notify) {
      this.afterSelectionChange();
      this.emitter.emit("unselect", option ?? { value, label: value });
    }
  }

  /**
   * Keeps every tree parent's own membership in `selected` consistent with
   * its descendants (post-order, so parents see already-corrected children):
   * a parent counts as selected only when `computeCheckState` says "all".
   * No-op for data with no `children` anywhere.
   */
  private syncTreeAncestors(): void {
    syncDataTreeAncestors(this.data, this.selected, this.isOptionDisabled);
  }

  private clearSelection(): void {
    if (this.selected.length === 0) return;
    this.selected = [];
    this.emitter.emit("clear");
    this.afterSelectionChange();
  }

  private allSelectableValues(): string[] {
    const values: string[] = [];
    const visit = (option: Option): void => {
      if (!this.isOptionDisabled(option)) values.push(option.value);
      option.children?.forEach(visit);
    };
    for (const item of this.data) (isGroup(item) ? item.options : [item]).forEach(visit);
    return values;
  }

  private afterSelectionChange(emitChange = true): void {
    this.renderValue();
    this.syncNativeSelect(emitChange);
    if (!this.opts.required || this.selected.length > 0) {
      this.control.classList.remove("forge-select__control--invalid");
      this.control.removeAttribute("aria-invalid");
    }
    if (this.isOpen) {
      // A plain selection doesn't change which rows match the current search,
      // so a full buildRows() re-scan of the dataset is wasted work — unless
      // maxSelections is set, in which case crossing the cap changes which
      // rows are interactable/keyboard-navigable (navItems is only rebuilt by
      // buildRows()), so the full rebuild is required in that case.
      if (this.opts.maxSelections != null) this.renderList();
      else this.renderRows();
    }
    if (emitChange) this.emitter.emit("change", this.getValue());
  }

  private syncNativeSelect(dispatchChange = true): void {
    if (!(this.el instanceof HTMLSelectElement)) return;
    // Set/Map rather than includes()/find() inside these loops: this runs on
    // every selection change, so a linear scan per <option> made syncing a
    // large multi-select quadratic in its own right, independent of the
    // selection path that called it.
    const selectedValues = new Set(this.selected);
    const byValue = new Map<string, HTMLOptionElement>();
    for (const option of Array.from(this.el.options)) {
      if (!byValue.has(option.value)) byValue.set(option.value, option);
      option.selected = selectedValues.has(option.value);
    }
    for (const value of this.selected) {
      if (byValue.has(value)) continue;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = this.selectedOptions.get(value)?.label ?? value;
      option.selected = true;
      this.el.append(option);
      byValue.set(value, option);
    }
    if (this.opts.sortable && this.opts.multiple) {
      // Re-appending in `this.selected` order moves each selected <option> to
      // the end in that relative order, so a real <select multiple> form
      // submission serializes values in the dragged order (unselected options
      // simply end up interleaved before them, which submission ignores).
      for (const value of this.selected) {
        const option = byValue.get(value);
        if (option) this.el.append(option);
      }
    }
    if (!dispatchChange) return;
    this.syncingNative = true;
    try {
      this.el.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
      this.syncingNative = false;
    }
  }

  private findOption(value: string): Option | undefined {
    return this.optionByValue.get(value);
  }

  /** Fills the label index on first use; see the field for why it is deferred. */
  private labelIndex(): Map<string, Option> {
    if (this.optionByLabel) return this.optionByLabel;
    const index = new Map<string, Option>();
    const visit = (option: Option): void => {
      const label = normalizeSearchText(option.label, this.opts.accentInsensitive);
      if (!index.has(label)) index.set(label, option);
      option.children?.forEach(visit);
    };
    for (const item of this.data) (isGroup(item) ? item.options : [item]).forEach(visit);
    this.optionByLabel = index;
    return index;
  }

  private findOptionByLabel(label: string): Option | undefined {
    return this.labelIndex().get(normalizeSearchText(label, this.opts.accentInsensitive));
  }

  private rebuildOptionIndexes(): void {
    this.optionByValue.clear();
    this.optionByLabel = null;
    this.hasNestedOptions = false;
    const duplicates = new Set<string>();
    const visit = (option: Option): void => {
      if (this.optionByValue.has(option.value)) duplicates.add(option.value);
      else this.optionByValue.set(option.value, option);
      if (option.children?.length) {
        this.hasNestedOptions = true;
        option.children.forEach(visit);
      }
    };
    for (const item of this.data) (isGroup(item) ? item.options : [item]).forEach(visit);
    if (duplicates.size === 0 || this.opts.duplicateValuePolicy === "ignore") return;
    const message = `ForgeSelect: duplicate option value(s): ${[...duplicates].join(", ")}`;
    if (this.opts.duplicateValuePolicy === "error") throw new Error(message);
    console.warn(message);
  }

  /** Selects an existing option matching `label` exactly, or creates and selects a new one. */
  private createTag(label: string): TagCreation | undefined | Promise<TagCreation | undefined> {
    const trimmed = label.trim();
    if (!trimmed) return undefined;
    const existing = this.findOptionByLabel(trimmed);
    if (existing) {
      if (this.selected.includes(existing.value)) return undefined;
      if (this.opts.multiple && !this.canSelectOption(existing)) {
        this.announceMaximum(existing);
        return undefined;
      }
      if (this.opts.beforeSelect?.(existing) === false) return undefined;
      this.selectValue(existing.value, false);
      return { option: existing, created: false };
    }
    if (this.opts.beforeCreate?.(trimmed) === false) return undefined;
    // createOption's sync-undefined return means "cancel creation" (see CreateOption
    // in types.ts), distinct from "createOption isn't configured" — `?? fallback`
    // would conflate the two and create the default option even when a configured
    // createOption explicitly rejected the label.
    if (!this.opts.createOption) return this.addCreatedOption({ value: trimmed, label: trimmed });
    const created = this.opts.createOption(trimmed);
    if (created instanceof Promise) {
      return created.then((option) => (option ? this.addCreatedOption(option) : undefined));
    }
    return created ? this.addCreatedOption(created) : undefined;
  }

  private addCreatedOption(option: Option): TagCreation | undefined {
    if (this.opts.multiple && !this.canSelectOption(option)) {
      this.announceMaximum(option);
      return undefined;
    }
    const duplicate = this.findOption(option.value);
    if (duplicate) {
      if (this.selected.includes(duplicate.value)) return undefined;
      if (this.opts.beforeSelect?.(duplicate) === false) return undefined;
      this.selectValue(duplicate.value, false);
      return { option: duplicate, created: false };
    }
    this.data.push(option);
    this.rebuildOptionIndexes();
    this.selectValue(option.value, false);
    return { option, created: true };
  }

  private createFromQuery(): void {
    const label = this.query.trim();
    if (!label) return;
    const result = this.createTag(label);
    if (result instanceof Promise) {
      void result
        .then((created) => this.finishCreateFromQuery(created, label))
        .catch((cause: unknown) => {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          this.emitter.emit("error", error);
        });
      return;
    }
    this.finishCreateFromQuery(result, label);
  }

  private finishCreateFromQuery(result: TagCreation | undefined, sourceLabel: string): void {
    if (!result || this.destroyed) return;
    if (this.searchInput && this.query.trim() === sourceLabel) {
      this.searchInput.value = "";
      this.query = "";
    }
    this.afterSelectionChange();
    if (result.created) this.emitter.emit("create", result.option);
    this.emitter.emit("select", result.option);
    if (!this.opts.multiple || this.opts.closeOnSelect) this.close();
    else if (this.isOpen) this.renderList();
  }

  private activateNavItem(navIndex: number): void {
    const item = this.navItems[navIndex];
    if (!item) return;
    if (item.kind === "create") {
      this.createFromQuery();
      return;
    }
    const { value } = item.option;
    if (this.opts.multiple) {
      let changed = false;
      if (this.selected.includes(value)) {
        if (this.opts.beforeUnselect?.(item.option) === false) return;
        this.deselectValue(value, true);
        changed = true;
      } else if (this.canSelectOption(item.option)) {
        if (this.opts.beforeSelect?.(item.option) === false) return;
        this.selectValue(value, true);
        changed = true;
      } else {
        this.announceMaximum(item.option);
      }
      if (changed && this.opts.closeOnSelect) this.close();
    } else {
      if (this.opts.beforeSelect?.(item.option) === false) return;
      this.selectValue(value, true);
      this.close();
      this.control.focus();
    }
  }

  // ---------------------------------------------------------------- rendering

  private renderValue(): void {
    this.valueEl.textContent = "";
    const hasValue = this.selected.length > 0;
    this.clearBtn.hidden = !(this.opts.clearable && hasValue);

    if (!hasValue) {
      const placeholder = document.createElement("span");
      placeholder.className = "forge-select__placeholder";
      placeholder.textContent = this.opts.placeholder;
      this.valueEl.append(placeholder);
      return;
    }

    if (this.opts.multiple) {
      // Past the cap the remainder becomes one counter chip, so a control
      // holding a very large selection costs a fixed number of nodes to build
      // and to lay out rather than four per selection.
      const cap = this.opts.maxVisibleTags;
      const shown = cap == null || this.selected.length <= cap ? this.selected : this.selected.slice(0, cap);
      for (const value of shown) {
        const option = this.selectedOptions.get(value) ?? { value, label: value };
        const tag = document.createElement("span");
        tag.className = "forge-select__tag";
        const label = document.createElement("span");
        label.className = "forge-select__tag-label";
        renderOptionContent(label, option, this.opts.templateSelection, "inline", this.opts.sanitizeTemplate);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "forge-select__tag-remove";
        remove.setAttribute("aria-label", format(this.strings.removeItem, { label: option.label }));
        remove.textContent = "×";
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!this.isDisabled && this.opts.beforeUnselect?.(option) !== false) this.deselectValue(value, true);
        });
        tag.append(label, remove);
        if (this.opts.sortable) {
          tag.dataset.value = value;
          tag.tabIndex = 0;
          tag.setAttribute("aria-roledescription", "draggable item");
          tag.setAttribute("aria-label", format(this.strings.reorderHint, { label: option.label }));
          tag.addEventListener("keydown", (event) => this.handleTagKeydown(event, value));
          this.bindTagDrag(tag, value);
        }
        this.valueEl.append(tag);
      }
      if (shown !== this.selected) {
        const overflow = document.createElement("span");
        overflow.className = "forge-select__tag-overflow";
        // Announced with the tags rather than skipped: a screen reader user
        // otherwise has no way to tell that the control is showing a subset.
        overflow.textContent = format(this.strings.moreTags, {
          count: String(this.selected.length - shown.length),
        });
        this.valueEl.append(overflow);
      }
    } else {
      const option = this.selectedOptions.get(this.selected[0]) ?? {
        value: this.selected[0],
        label: this.selected[0],
      };
      const span = document.createElement("span");
      span.className = "forge-select__single-value";
      renderOptionContent(span, option, this.opts.templateSelection, "inline", this.opts.sanitizeTemplate);
      this.valueEl.append(span);
    }
  }

  /**
   * Pointer-based (mouse/touch/pen) reorder for a single tag. Only the real
   * dragged DOM node is moved during the gesture — a full renderValue()
   * mid-drag would destroy it — so the reordered `this.selected` is only
   * committed on release. The move/up listeners and pointer capture live on
   * the stable `this.valueEl` container rather than the tag itself: `tag`
   * gets repositioned via `insertBefore` during the drag, and browsers treat
   * that reparenting as detaching the node, which silently drops pointer
   * capture (and further move events) if it were captured on `tag`.
   */
  private bindTagDrag(tag: HTMLSpanElement, value: string): void {
    const DRAG_THRESHOLD = 4;
    let startX = 0;
    let dragging = false;
    let order: string[] = [];

    const onPointerMove = (event: PointerEvent): void => {
      if (!dragging) {
        if (Math.abs(event.clientX - startX) < DRAG_THRESHOLD) return;
        dragging = true;
        order = [...this.selected];
        if (typeof this.valueEl.setPointerCapture === "function") {
          this.valueEl.setPointerCapture(event.pointerId);
        }
        tag.classList.add("forge-select__tag--dragging");
      }
      event.preventDefault();

      const draggedIndex = order.indexOf(value);
      const siblings = Array.from(this.valueEl.querySelectorAll<HTMLElement>(".forge-select__tag"));
      for (const sibling of siblings) {
        if (sibling === tag) continue;
        const siblingValue = sibling.dataset.value;
        if (!siblingValue) continue;
        const siblingIndex = order.indexOf(siblingValue);
        if (siblingIndex === -1) continue;
        const rect = sibling.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const movingRight = draggedIndex < siblingIndex;
        const crossed = movingRight ? event.clientX > midX : event.clientX < midX;
        if (!crossed) continue;
        order.splice(draggedIndex, 1);
        order.splice(siblingIndex, 0, value);
        if (movingRight) this.valueEl.insertBefore(tag, sibling.nextSibling);
        else this.valueEl.insertBefore(tag, sibling);
        break;
      }
    };

    const finishDrag = (event: PointerEvent): void => {
      this.valueEl.removeEventListener("pointermove", onPointerMove);
      this.valueEl.removeEventListener("pointerup", finishDrag);
      this.valueEl.removeEventListener("pointercancel", finishDrag);
      if (!dragging) return;
      if (typeof this.valueEl.releasePointerCapture === "function") {
        this.valueEl.releasePointerCapture(event.pointerId);
      }
      tag.classList.remove("forge-select__tag--dragging");
      this.selected = order;
      this.suppressNextTagClick = true;
      this.afterSelectionChange();
      this.emitter.emit("reorder", [...this.selected]);
    };

    tag.addEventListener("pointerdown", (event) => {
      if (this.isDisabled || event.button !== 0) return;
      if ((event.target as HTMLElement).closest(".forge-select__tag-remove")) return;
      startX = event.clientX;
      dragging = false;
      this.valueEl.addEventListener("pointermove", onPointerMove);
      this.valueEl.addEventListener("pointerup", finishDrag);
      this.valueEl.addEventListener("pointercancel", finishDrag);
    });
  }

  /** Alt+Left/Alt+Right on a focused tag: the keyboard-operable equivalent of dragging. */
  private handleTagKeydown(event: KeyboardEvent, value: string): void {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    const index = this.selected.indexOf(value);
    const targetIndex = event.key === "ArrowLeft" ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= this.selected.length) return;
    event.preventDefault();
    event.stopPropagation();
    const next = [...this.selected];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    this.selected = next;
    this.afterSelectionChange();
    this.emitter.emit("reorder", [...this.selected]);
    this.focusTagByValue(value);
  }

  private focusTagByValue(value: string): void {
    for (const tag of Array.from(this.valueEl.querySelectorAll<HTMLElement>(".forge-select__tag"))) {
      if (tag.dataset.value === value) {
        tag.focus();
        return;
      }
    }
  }

  private buildRows(): void {
    this.rows = [];
    this.navItems = [];
    this.rowSetSize = 0;
    this.rowOffsetsCache = null;
    let optionCount = 0;
    const trimmedQuery = this.query.trim();
    const query = normalizeSearchText(trimmedQuery, this.opts.accentInsensitive);
    // Scoring is per option, but everything it derives from the query and the
    // config is not, so both are built once here rather than inside the loop.
    const prepared = this.searchIndex.prepare(trimmedQuery, {
      fields: this.opts.searchFields,
      tokenSearch: this.opts.tokenSearch,
      accentInsensitive: this.opts.accentInsensitive,
      scorer: this.opts.searchScorer,
    });
    const matches = (option: Option): boolean =>
      query === "" ||
      (this.opts.filterOption
        ? this.opts.filterOption(option, trimmedQuery)
        : this.searchIndex.scorePrepared(option, prepared) > 0);

    // A tree node is visible while searching if it matches, or any descendant
    // does (leaf options with no children just reduce to `matches()`).
    const subtreeMatchCache = this.hasNestedOptions ? new Map<Option, boolean>() : null;
    const subtreeMatches = (option: Option): boolean => {
      // With no query every node is visible, so the cache would only ever be
      // filled with `true` for the whole dataset and never read back.
      if (query === "") return true;
      // The cache pays off only for a node reachable twice — once through its
      // parent's `.some()` and again as that parent expands. Without nested
      // options nothing is, so every entry would be written and never read.
      if (!subtreeMatchCache) return matches(option);
      const cached = subtreeMatchCache.get(option);
      if (cached !== undefined) return cached;
      const result = matches(option) || (option.children?.some(subtreeMatches) ?? false);
      subtreeMatchCache.set(option, result);
      return result;
    };

    // Constant for the whole pass: `selected` cannot change while rows build.
    const atMaximum = this.hasReachedMaximum();
    const pushOption = (option: Option, depth: number, parentValue?: string): void => {
      let navIndex = -1;
      const interactionDisabled = this.isOptionDisabled(option) || (atMaximum && !this.selected.includes(option.value));
      if (!interactionDisabled) {
        navIndex = this.navItems.length;
        this.navItems.push({ kind: "option", option, parentValue });
      }
      const hasChildren = !!option.children && option.children.length > 0;
      optionCount += 1;
      this.rows.push({ kind: "option", option, navIndex, depth, hasChildren, posInSet: optionCount });
      if (hasChildren) {
        // Expanding is ephemeral while searching (never written to
        // expandedValues), so clearing the query restores manual state.
        const expanded = query !== "" || this.expandedValues.has(option.value);
        if (expanded) {
          for (const child of option.children!) {
            if (subtreeMatches(child)) pushOption(child, depth + 1, option.value);
          }
        }
      }
    };

    if (trimmedQuery !== "" && trimmedQuery.length < this.opts.minSearchLength) {
      this.rows.push({ kind: "min-length" });
      return;
    }
    if (this.loading) {
      this.rows.push({ kind: "loading" });
      return;
    }
    if (this.loadError) {
      this.rows.push({ kind: "error" });
      return;
    }

    for (const item of this.data) {
      if (isGroup(item)) {
        const visible = item.options.filter(subtreeMatches);
        if (visible.length === 0) continue;
        this.rows.push({ kind: "group", label: item.label });
        visible.forEach((o) => pushOption(o, 0));
      } else if (subtreeMatches(item)) {
        pushOption(item, 0);
      }
    }

    if (this.opts.allowCreate && query !== "" && !this.hasExactMatch(query)) {
      const navIndex = this.navItems.length;
      optionCount += 1;
      this.navItems.push({ kind: "create" });
      this.rows.push({ kind: "create", navIndex, posInSet: optionCount });
    }
    this.rowSetSize = optionCount;

    if (this.rows.length === 0) this.rows.push({ kind: "empty" });
    else if (this.loadingMore) this.rows.push({ kind: "loading-more" });
  }

  private hasExactMatch(lowerQuery: string): boolean {
    return !!this.findOptionByLabel(lowerQuery);
  }

  private usesVirtualScroll(): boolean {
    return this.opts.virtualScroll !== false && this.rows.length > VIRTUAL_THRESHOLD;
  }

  /**
   * Drops every per-row cache at once. Rendered content, recycled <li>
   * elements, and measured heights are all keyed off the current `data`, so
   * they must be invalidated together whenever `data` is replaced — clearing
   * only some of them leaves recycled rows carrying state from the old list.
   */
  private clearRowCaches(): void {
    this.rowContentCache.clear();
    this.rowElementCache.clear();
    this.rowHeightCache.clear();
    // Derived from rowHeightCache, so it has to go with it: buildRows() happens
    // to reset it on the way to every render today, but leaving it behind here
    // would reintroduce exactly the partial invalidation this helper exists to
    // prevent if a render ever runs straight off cleared caches.
    this.rowOffsetsCache = null;
  }

  /** Identifies a row *position*, which is what measured heights are tied to. */
  private rowKey(row: Row, index: number): string {
    if (row.kind === "option") return `option:${row.option.value}:${index}`;
    if (row.kind === "group") return `group:${row.label}:${index}`;
    return `${row.kind}:${index}`;
  }

  /**
   * Identifies a row's *content* for `<li>` recycling, deliberately without the
   * row index: filtering shifts every index below the first change, so an
   * index-keyed element cache misses on every keystroke — exactly when the list
   * re-renders most. renderRow() rewrites the element completely, so reusing it
   * at a new position is safe.
   *
   * Keys are not guaranteed unique within a render — duplicateValuePolicy
   * defaults to warning rather than rejecting duplicate values — so callers
   * must not hand the same element to two rows of one render.
   */
  private rowElementKey(row: Row): string {
    if (row.kind === "option") return `option:${row.option.value}`;
    if (row.kind === "group") return `group:${row.label}`;
    return row.kind;
  }

  private measuredRowHeight(index: number): number {
    return this.opts.variableItemHeight
      ? (this.rowHeightCache.get(this.rowKey(this.rows[index], index)) ?? this.opts.itemHeight)
      : this.opts.itemHeight;
  }

  private rowOffset(index: number): number {
    if (!this.opts.variableItemHeight) return index * this.opts.itemHeight;
    let offset = 0;
    for (let i = 0; i < index; i += 1) offset += this.measuredRowHeight(i);
    return offset;
  }

  private rowOffsets(): number[] {
    if (this.rowOffsetsCache) return this.rowOffsetsCache;
    const offsets = [0];
    for (let i = 0; i < this.rows.length; i += 1) offsets.push(offsets[i] + this.measuredRowHeight(i));
    this.rowOffsetsCache = offsets;
    return offsets;
  }

  private renderList(): void {
    this.buildRows();
    this.renderRows();
    this.announceStatus();
  }

  private announceStatus(): void {
    const first = this.rows[0];
    const message = this.hasReachedMaximum()
      ? format(this.strings.maximumSelected, { count: String(this.opts.maxSelections) })
      : first?.kind === "loading"
        ? this.strings.loading
        : first?.kind === "error"
          ? this.strings.errorLoading
          : first?.kind === "empty"
            ? this.strings.noResults
            : first?.kind === "min-length"
              ? format(this.strings.minSearchLength, { count: String(this.opts.minSearchLength) })
              : "";
    if (this.liveRegion.textContent !== message) this.liveRegion.textContent = message;
  }

  private renderRows(): void {
    // Capture the scroll offset and viewport height BEFORE clearing the list:
    // removing the children collapses both scrollHeight (clamping scrollTop to 0)
    // and clientHeight (the list has no explicit height, only max-height, so an
    // empty list reports just its padding instead of the real box height).
    const scrollTop = this.list.scrollTop;
    const clientHeight = this.list.clientHeight;
    const virtual = this.usesVirtualScroll();
    this.list.textContent = "";

    const rowHeight = this.opts.itemHeight;
    const offsets = this.opts.variableItemHeight ? this.rowOffsets() : null;
    let start = 0;
    let end = this.rows.length;
    if (virtual) {
      const viewport = clientHeight || rowHeight * 8;
      if (this.opts.variableItemHeight) {
        let low = 0;
        let high = this.rows.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (offsets![middle + 1] < scrollTop) low = middle + 1;
          else high = middle;
        }
        start = low;
        start = Math.max(0, start - VIRTUAL_BUFFER);
        end = start;
        const target = scrollTop + viewport + VIRTUAL_BUFFER * rowHeight;
        while (end < this.rows.length && offsets![end] < target) end += 1;
      } else {
        start = Math.max(0, Math.floor(scrollTop / rowHeight) - VIRTUAL_BUFFER);
        end = Math.min(this.rows.length, start + Math.ceil(viewport / rowHeight) + VIRTUAL_BUFFER * 2);
      }

      const topSpacer = document.createElement("li");
      topSpacer.className = "forge-select__spacer";
      topSpacer.setAttribute("aria-hidden", "true");
      topSpacer.style.height = `${offsets?.[start] ?? this.rowOffset(start)}px`;
      this.list.append(topSpacer);
    }

    // Append every row first, then measure afterward: interleaving writes
    // (append) and reads (getBoundingClientRect) forces a synchronous layout
    // flush on every iteration. Measuring in a separate pass still forces one
    // flush overall (unavoidable — real heights are needed), but only once
    // per renderRows() call instead of once per row.
    const appended: HTMLLIElement[] = [];
    // Two rows of one render can share an element key (duplicate option values
    // are warned about, not rejected). Appending one element twice would move
    // it rather than add it, silently dropping a row, so each element is
    // claimed at most once per render and later rows fall back to a new one.
    const claimed = new Set<HTMLLIElement>();
    for (let i = start; i < end; i++) {
      const key = this.rowElementKey(this.rows[i]);
      const cached = this.rowElementCache.get(key);
      const element = this.renderRow(this.rows[i], cached && !claimed.has(cached) ? cached : undefined);
      claimed.add(element);
      this.rowElementCache.set(key, element);
      if (this.rowElementCache.size > ROW_CACHE_LIMIT) {
        const oldest = this.rowElementCache.keys().next().value as string;
        this.rowElementCache.delete(oldest);
      }
      this.list.append(element);
      appended.push(element);
    }
    if (this.opts.variableItemHeight) {
      for (let i = start; i < end; i++) {
        const element = appended[i - start];
        const measured = element.getBoundingClientRect().height || element.offsetHeight;
        if (measured > 0) {
          const key = this.rowKey(this.rows[i], i);
          if (this.rowHeightCache.get(key) !== measured) this.rowOffsetsCache = null;
          this.rowHeightCache.set(key, measured);
        }
      }
    }

    if (virtual) {
      const bottomSpacer = document.createElement("li");
      bottomSpacer.className = "forge-select__spacer";
      bottomSpacer.setAttribute("aria-hidden", "true");
      bottomSpacer.style.height = `${offsets ? offsets[this.rows.length] - offsets[end] : this.rowOffset(this.rows.length) - this.rowOffset(end)}px`;
      this.list.append(bottomSpacer);

      // Restore the offset that clearing clamped away. The net scroll change
      // within this handler is zero, so this does not re-fire the scroll
      // listener; even if it did, the re-render is idempotent and settles.
      if (this.list.scrollTop !== scrollTop) {
        this.list.scrollTop = scrollTop;
      }
    }

    this.updateActiveDescendant();
  }

  private renderRow(row: Row, recycled?: HTMLLIElement): HTMLLIElement {
    const li = recycled ?? document.createElement("li");
    li.replaceChildren();
    li.className = "";
    for (const attribute of [
      "role",
      "id",
      "aria-hidden",
      "aria-selected",
      "aria-disabled",
      "aria-expanded",
      "aria-level",
      "aria-setsize",
      "aria-posinset",
      "data-nav-index",
      "data-option-value",
      "data-selection-state",
      // Tree rows set an inline padding-left indent; clearing the whole
      // attribute keeps recycling self-contained, so a row reused at a
      // shallower depth can't inherit the previous row's indent.
      "style",
    ])
      li.removeAttribute(attribute);
    switch (row.kind) {
      case "group":
        li.className = "forge-select__group-label";
        li.setAttribute("role", "presentation");
        li.textContent = row.label;
        break;
      case "empty":
        li.className = "forge-select__empty";
        li.setAttribute("role", "option");
        li.setAttribute("aria-disabled", "true");
        li.setAttribute("aria-selected", "false");
        li.textContent = this.strings.noResults;
        break;
      case "min-length":
        li.className = "forge-select__min-length";
        li.setAttribute("role", "option");
        li.setAttribute("aria-disabled", "true");
        li.setAttribute("aria-selected", "false");
        li.textContent = format(this.strings.minSearchLength, { count: String(this.opts.minSearchLength) });
        break;
      case "error":
        li.className = "forge-select__error";
        li.setAttribute("role", "option");
        li.setAttribute("aria-disabled", "true");
        li.setAttribute("aria-selected", "false");
        li.textContent = this.strings.errorLoading;
        break;
      case "loading":
        li.className = "forge-select__loading";
        li.setAttribute("role", "option");
        li.setAttribute("aria-disabled", "true");
        li.setAttribute("aria-selected", "false");
        li.textContent = this.strings.loading;
        break;
      case "loading-more":
        li.className = "forge-select__loading-more";
        li.setAttribute("aria-hidden", "true");
        li.textContent = this.strings.loadingMore;
        break;
      case "create":
        li.className = "forge-select__option forge-select__option--create";
        li.setAttribute("role", "option");
        li.setAttribute("aria-setsize", String(this.rowSetSize));
        li.setAttribute("aria-posinset", String(row.posInSet));
        li.id = `${this.uid}-nav-${row.navIndex}`;
        li.dataset.navIndex = String(row.navIndex);
        li.textContent = format(this.strings.createOption, { query: this.query.trim() });
        if (row.navIndex === this.highlightedIndex) li.classList.add("forge-select__option--highlighted");
        break;
      case "option":
        this.renderOptionRow(li, row);
        break;
    }
    return li;
  }

  private renderOptionRow(li: HTMLLIElement, row: Extract<Row, { kind: "option" }>): void {
    li.className = "forge-select__option";
    li.dataset.optionValue = row.option.value;
    if (row.option.className) li.classList.add(...row.option.className.trim().split(/\s+/).filter(Boolean));
    li.setAttribute("role", "option");
    // Virtual scrolling renders a window of ~20 rows out of a list that can be
    // thousands long, so without these a screen reader announces "1 of 20".
    li.setAttribute("aria-setsize", String(this.rowSetSize));
    li.setAttribute("aria-posinset", String(row.posInSet));
    const isSelected = this.selected.includes(row.option.value);
    li.setAttribute("aria-selected", String(isSelected));
    if (isSelected) li.classList.add("forge-select__option--selected");
    if (
      this.opts.multiple &&
      row.hasChildren &&
      computeCheckState(row.option, this.selected, this.isOptionDisabled) === "some"
    ) {
      li.classList.add("forge-select__option--indeterminate");
      li.dataset.selectionState = "mixed";
    }
    if (row.depth > 0) {
      li.style.paddingLeft = `calc(12px + ${row.depth} * var(--fs-tree-indent, 18px))`;
    }
    if (this.isOptionDisabled(row.option) || (this.hasReachedMaximum() && !this.selected.includes(row.option.value))) {
      li.classList.add("forge-select__option--disabled");
      li.setAttribute("aria-disabled", "true");
    } else {
      li.id = `${this.uid}-nav-${row.navIndex}`;
      li.dataset.navIndex = String(row.navIndex);
      if (row.navIndex === this.highlightedIndex) li.classList.add("forge-select__option--highlighted");
    }
    if (row.hasChildren) {
      const expanded = this.query !== "" || this.expandedValues.has(row.option.value);
      li.setAttribute("aria-expanded", String(expanded));
      const twisty = document.createElement("span");
      twisty.className = "forge-select__twisty";
      twisty.dataset.twisty = row.option.value;
      twisty.setAttribute("aria-hidden", "true");
      twisty.textContent = expanded ? "▼" : "▶";
      li.append(twisty);
    }
    li.append(this.optionContent(row.option));
  }

  /**
   * Rendered row content is cached per option value and cloned on each render,
   * so templates run once per option instead of once per scroll frame.
   * State classes (selected/highlighted/disabled) live on the <li>, keeping the
   * cached content state-free.
   */
  private optionContent(option: Option): Node {
    if (this.opts.highlightSearch && this.query.trim() && !this.opts.templateResult) {
      const holder = document.createElement("span");
      holder.className = "forge-select__option-content";
      renderOptionContent(holder, option, undefined);
      const label = holder.querySelector<HTMLElement>(".forge-select__option-label") ?? holder;
      const ranges = findNormalizedRanges(option.label, this.query, this.opts.accentInsensitive);
      if (ranges.length) {
        label.textContent = "";
        let cursor = 0;
        for (const [start, end] of ranges) {
          if (start < cursor) continue;
          label.append(document.createTextNode(option.label.slice(cursor, start)));
          const mark = document.createElement("mark");
          mark.className = "forge-select__match";
          mark.textContent = option.label.slice(start, end);
          label.append(mark);
          cursor = end;
        }
        label.append(document.createTextNode(option.label.slice(cursor)));
      }
      return holder;
    }
    let cached = this.rowContentCache.get(option);
    if (!cached) {
      const holder = document.createElement("span");
      holder.className = "forge-select__option-content";
      renderOptionContent(holder, option, this.opts.templateResult, "row", this.opts.sanitizeTemplate);
      if (this.rowContentCache.size >= ROW_CACHE_LIMIT) {
        // FIFO eviction keeps memory bounded on very large lists.
        const oldest = this.rowContentCache.keys().next().value as Option;
        this.rowContentCache.delete(oldest);
      }
      this.rowContentCache.set(option, holder);
      cached = holder;
    }
    return cached.cloneNode(true);
  }

  private moveHighlight(delta: number): void {
    if (this.navItems.length === 0) return;
    const next =
      this.highlightedIndex === -1
        ? delta > 0
          ? 0
          : this.navItems.length - 1
        : (this.highlightedIndex + delta + this.navItems.length) % this.navItems.length;
    this.focusNavIndex(next);
  }

  private focusNavIndex(next: number): void {
    if (this.navItems.length === 0) return;
    this.highlightedIndex = next;

    if (this.usesVirtualScroll()) {
      const rowIndex = this.rows.findIndex(
        (row) => (row.kind === "option" || row.kind === "create") && row.navIndex === next,
      );
      if (rowIndex >= 0) {
        const rowHeight = this.measuredRowHeight(rowIndex);
        const top = this.rowOffset(rowIndex);
        const viewport = this.list.clientHeight || rowHeight * 8;
        let target = this.list.scrollTop;
        if (top < target) target = top;
        else if (top + rowHeight > target + viewport) target = top + rowHeight - viewport;
        if (target !== this.list.scrollTop) this.list.scrollTop = target;
      }
      this.renderRows();
    } else {
      this.renderRows();
      const highlighted = this.list.querySelector<HTMLElement>(".forge-select__option--highlighted");
      highlighted?.scrollIntoView?.({ block: "nearest" });
    }
  }

  private navigateTree(direction: "left" | "right"): boolean {
    const item = this.navItems[this.highlightedIndex];
    if (!item || item.kind !== "option") return false;
    const { option, parentValue } = item;
    const hasChildren = !!option.children?.length;
    const expanded = this.query !== "" || this.expandedValues.has(option.value);

    if (direction === "right") {
      if (hasChildren && !expanded) {
        this.expandedValues.add(option.value);
        this.renderList();
        return true;
      }
      if (hasChildren) {
        const childIndex = this.navItems.findIndex((nav) => nav.kind === "option" && nav.parentValue === option.value);
        if (childIndex >= 0) {
          this.focusNavIndex(childIndex);
          return true;
        }
      }
      return false;
    }

    if (hasChildren && expanded && this.query === "") {
      this.expandedValues.delete(option.value);
      this.renderList();
      return true;
    }
    if (parentValue) {
      const parentIndex = this.navItems.findIndex((nav) => nav.kind === "option" && nav.option.value === parentValue);
      if (parentIndex >= 0) {
        this.focusNavIndex(parentIndex);
        return true;
      }
    }
    return false;
  }

  /**
   * Reads the id off the row the render pass just marked, rather than rebuilding
   * it from the highlight index. Virtual scrolling drops off-window rows, so an
   * index-derived id can name an element that no longer exists, and
   * aria-activedescendant must resolve to a real one — a dangling reference
   * reads to assistive tech as no active option at all. Keyboard navigation
   * scrolls the highlight back into view, which restores the reference.
   *
   * The reference has to land on whichever element actually holds focus.
   * open() only focuses the search input when it is visible, so a select whose
   * input is hidden (minResultsForSearch, or searchable data below the
   * threshold) keeps focus on the control — pointing the attribute at the
   * hidden input there names an element no assistive tech is on, and the
   * focused combobox announces nothing at all while the user arrows through
   * the list.
   */
  private updateActiveDescendant(): void {
    const focused = this.searchInput && !this.searchInput.hidden ? this.searchInput : this.control;
    // Whichever of the two isn't focused must not keep a stale reference: the
    // search box can be shown or hidden at runtime by updateOptions()/setData().
    const other = focused === this.control ? this.searchInput : this.control;
    other?.removeAttribute("aria-activedescendant");
    // A closed combobox has no active option. close() leaves the last render's
    // highlight markup in the hidden dropdown, so this is gated on isOpen
    // rather than on finding a highlighted row.
    const highlighted = this.isOpen ? this.list.querySelector(".forge-select__option--highlighted") : null;
    if (highlighted) focused.setAttribute("aria-activedescendant", highlighted.id);
    else focused.removeAttribute("aria-activedescendant");
  }

  // ---------------------------------------------------------------- remote data

  private scheduleRemoteLoad(query: string, delay: number): void {
    if (this.ajaxTimer) clearTimeout(this.ajaxTimer);
    const requestId = ++this.ajaxRequestId;
    this.ajaxController?.abort();
    this.ajaxController = null;
    this.page = 0;
    this.hasMore = true;
    this.nextCursor = undefined;
    this.setLoading(true);
    this.loadingMore = false;
    this.loadError = null;
    this.renderList();
    this.ajaxTimer = setTimeout(() => {
      this.ajaxTimer = null;
      void this.loadRemote(query, { requestId });
    }, delay);
  }

  private setLoading(loading: boolean): void {
    if (this.loading === loading) return;
    this.loading = loading;
    this.emitter.emit("loading", loading);
  }

  private remoteCacheKey(query: string, page: number, cursor?: string): string {
    // Tagged so a cursor value that happens to equal a page number (e.g. both
    // "0") can't collide with the unrelated page-numbered cache entry.
    return `${query}\u0000${cursor !== undefined ? `c:${cursor}` : `p:${page}`}`;
  }

  private fetchRemoteResult(
    query: string,
    page: number,
    signal: AbortSignal,
    cursor?: string,
  ): Promise<{ options: Option[]; hasMore: boolean; nextCursor?: string }> {
    const key = this.remoteCacheKey(query, page, cursor);
    const pending = this.remoteInFlight.get(key);
    if (pending) return pending;
    const ajax = this.opts.ajax!;
    const request = this.requestRemote(query, page, signal, cursor)
      .then((json) => normalizeRemoteResult(ajax, json))
      .finally(() => this.remoteInFlight.delete(key));
    this.remoteInFlight.set(key, request);
    return request;
  }

  private async requestRemote(query: string, page: number, signal: AbortSignal, cursor?: string): Promise<unknown> {
    const ajax = this.opts.ajax!;
    const attempts = Math.max(0, Math.floor(ajax.retry ?? 0)) + 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        if (ajax.request)
          return cursor === undefined
            ? await ajax.request(query, page, signal)
            : await ajax.request(query, page, signal, cursor);
        const response = await fetch(buildUrl(ajax, query, page, cursor), { signal });
        if (response.ok === false) throw new Error(`ForgeSelect: remote request failed with HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        if (signal.aborted || attempt === attempts - 1) throw error;
        const delay = Math.max(0, ajax.retryDelay ?? 250) * 2 ** attempt;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delay);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      }
    }
    throw lastError;
  }

  private async prefetchRemote(query: string): Promise<void> {
    const ajax = this.opts.ajax;
    if (!ajax || (ajax.cacheTtl ?? 30000) <= 0) return;
    const key = this.remoteCacheKey(query, 0);
    if (this.remoteCache.get(key)) return;
    const controller = new AbortController();
    this.prefetchControllers.add(controller);
    try {
      const result = await this.fetchRemoteResult(query, 0, controller.signal);
      this.remoteCache.set(key, result, ajax.cacheTtl ?? 30000);
    } catch {
      // Prefetch is intentionally best-effort and must not surface UI errors.
    } finally {
      this.prefetchControllers.delete(controller);
    }
  }

  /**
   * Fires on every list scroll. Only acts when pagination is opted into via
   * `ajax.pagination`; reads real scroll geometry rather than row counts so
   * it works whether or not virtual scrolling is active for this list.
   */
  private maybeLoadNextPage(): void {
    const ajax = this.opts.ajax;
    if (!ajax?.pagination || !this.hasMore || this.loading || this.loadingMore) return;
    const { scrollHeight, scrollTop, clientHeight } = this.list;
    const threshold = this.opts.itemHeight * 2;
    if (scrollHeight - scrollTop - clientHeight >= threshold) return;
    this.loadingMore = true;
    this.renderList();
    void this.loadRemote(this.query, { append: true });
  }

  private async loadRemote(
    query: string,
    { append = false, requestId }: { append?: boolean; requestId?: number } = {},
  ): Promise<void> {
    const ajax = this.opts.ajax!;
    const activeRequestId = requestId ?? ++this.ajaxRequestId;
    if (activeRequestId !== this.ajaxRequestId) return;
    this.ajaxController?.abort();
    const controller = new AbortController();
    this.ajaxController = controller;
    const page = append ? this.page + 1 : 0;
    const cursor = append ? this.nextCursor : undefined;
    try {
      const key = this.remoteCacheKey(query, page, cursor);
      let result = this.remoteCache.get(key);
      if (!result) {
        result = await this.fetchRemoteResult(query, page, controller.signal, cursor);
        this.remoteCache.set(key, result, ajax.cacheTtl ?? 30000);
      }
      if (activeRequestId !== this.ajaxRequestId || this.destroyed) return;
      const { options, hasMore } = result;

      if (append) {
        // optionByValue holds exactly the values a fresh collectValues() walk
        // would produce, and rebuildOptionIndexes() below puts the appended page
        // into it, so each page costs a lookup per incoming option rather than a
        // rescan of everything loaded so far.
        this.data = [...this.data, ...options.filter((o) => !this.optionByValue.has(o.value))];
      } else {
        // Copied so addCreatedOption()'s push lands on our array rather than
        // the one ajax.transform just built for us.
        this.data = [...options];
        this.clearRowCaches();
      }
      this.page = page;
      this.hasMore = hasMore;
      this.nextCursor = result.nextCursor;
      this.remoteLoaded = true;
      this.loadError = null;
      this.rebuildOptionIndexes();
    } catch (cause) {
      if (activeRequestId !== this.ajaxRequestId || this.destroyed || controller.signal.aborted) return;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      if (!append) {
        this.data = [];
        this.clearRowCaches();
        // Every other assignment to `this.data` (constructor, setData,
        // addCreatedOption, the success branch above) rebuilds the value/label
        // indexes in step; skipping it here would leave optionByValue/optionByLabel
        // resolving options that are no longer in `this.data` until the next
        // successful load happens to rebuild them.
        this.rebuildOptionIndexes();
      }
      this.hasMore = false;
      this.loadError = error;
      this.emitter.emit("error", error);
    } finally {
      if (activeRequestId === this.ajaxRequestId && !this.destroyed) {
        this.ajaxController = null;
        this.setLoading(false);
        this.loadingMore = false;
        if (this.isOpen) this.renderList();
      }
    }
  }
}
