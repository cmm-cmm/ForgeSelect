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
  collectValues,
  computeCheckState,
  findOption as findDataOption,
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
} from "./types";

type Row =
  | { kind: "group"; label: string }
  | { kind: "option"; option: Option; navIndex: number; depth: number; hasChildren: boolean }
  | { kind: "create"; navIndex: number }
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
  filterOption?: (option: Option, query: string) => boolean;
  searchFields: SearchField[];
  tokenSearch: boolean;
  accentInsensitive: boolean;
  searchScorer?: SearchScorer;
  highlightSearch: boolean;
  minSearchLength: number;
  isOptionDisabled?: (option: Option) => boolean;
  minResultsForSearch: number;
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
  private highlightedIndex = -1;
  private typeaheadBuffer = "";
  private typeaheadTimer: ReturnType<typeof setTimeout> | null = null;
  private rowContentCache = new Map<string, Node>();
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
  private remoteCache = new RemoteCache<{ options: Option[]; hasMore: boolean }>();
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
    this.selected = [];
    for (const value of this.opts.multiple ? values : values.slice(0, 1)) this.selectValue(value, false);
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
      filterOption: options.filterOption,
      searchFields: options.searchFields ?? ["label", "description"],
      tokenSearch: options.tokenSearch ?? true,
      accentInsensitive: options.accentInsensitive ?? true,
      searchScorer: options.searchScorer,
      highlightSearch: options.highlightSearch ?? false,
      minSearchLength: Math.max(0, Math.floor(options.minSearchLength ?? 0)),
      minResultsForSearch: Math.max(0, Math.floor(options.minResultsForSearch ?? 0)),
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

    this.data = this.opts.data ?? (nativeSelect ? parseNativeOptions(nativeSelect) : []);
    if (nativeSelect && !this.opts.data) {
      const nativeOptions = Array.from(nativeSelect.options);
      const hasIntentionalSelection =
        nativeSelect.multiple ||
        nativeSelect.selectedIndex > 0 ||
        nativeOptions.some((option) => option.defaultSelected);
      for (const option of nativeOptions) {
        if (hasIntentionalSelection && option.selected) this.selectValue(option.value, false);
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
    this.renderList();
    this.positionDropdown();
    window.addEventListener("resize", this.onWindowResize);
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
    if (this.searchInput) {
      this.searchInput.value = "";
      this.query = "";
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
    const placement = computeDropdownPlacement(controlRect, this.dropdown.offsetHeight, window.innerHeight);
    this.root.classList.toggle("forge-select--drop-up", placement.dropUp);
    if (this.portalHost) {
      this.portalHost.style.top = `${placement.top}px`;
      this.portalHost.style.left = `${controlRect.left}px`;
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
    if (this.scrollRafId != null) cancelAnimationFrame(this.scrollRafId);
    if (this.typeaheadTimer) clearTimeout(this.typeaheadTimer);
    this.nativeSelect?.removeEventListener("change", this.onNativeChange);
    this.nativeSelect?.removeEventListener("invalid", this.onNativeInvalid);
    this.nativeForm?.removeEventListener("reset", this.onFormReset);
    this.rowContentCache.clear();
    this.rowHeightCache.clear();
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
    if (options.filterOption !== undefined) this.opts.filterOption = options.filterOption;
    if (options.searchFields !== undefined) this.opts.searchFields = options.searchFields;
    if (options.tokenSearch !== undefined) this.opts.tokenSearch = options.tokenSearch;
    if (options.accentInsensitive !== undefined) this.opts.accentInsensitive = options.accentInsensitive;
    if (options.searchScorer !== undefined) this.opts.searchScorer = options.searchScorer;
    if (options.highlightSearch !== undefined) this.opts.highlightSearch = options.highlightSearch;
    if (options.minSearchLength !== undefined)
      this.opts.minSearchLength = Math.max(0, Math.floor(options.minSearchLength));
    if (options.minResultsForSearch !== undefined)
      this.opts.minResultsForSearch = Math.max(0, Math.floor(options.minResultsForSearch));
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
    this.root.classList.toggle("forge-select--sortable", this.opts.sortable && this.opts.multiple);
    this.updateSearchVisibility();
    this.rowContentCache.clear();
    this.rowHeightCache.clear();
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
  }

  setValue(value: ForgeSelectValue, options: SetValueOptions = {}): void {
    const values = value == null ? [] : Array.isArray(value) ? value : [value];
    const next = this.opts.multiple ? values : values.slice(0, 1);
    if (arraysEqual(next, this.selected)) return;
    this.selected = [];
    for (const v of next) this.selectValue(v, false);
    this.afterSelectionChange(options.emitChange ?? true);
  }

  /**
   * Replaces the option list after construction. An open dropdown re-renders
   * immediately; a selection whose value isn't in the new data stays
   * selected (rendered via the already-selected option's own label/avatar,
   * the same fallback used for values selected from a stale ajax page).
   */
  setData(data: DataItem[]): void {
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
    this.data = data;
    this.opts.data = data;
    this.updateSearchVisibility();
    this.rowContentCache.clear();
    this.rowHeightCache.clear();
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
    this.selected = [];
    for (const value of this.allSelectableValues()) {
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
    return (
      this.opts.searchable && (this.opts.ajax != null || collectValues(this.data).size >= this.opts.minResultsForSearch)
    );
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
      this.clearSelection();
    });

    if (this.searchInput) {
      this.searchInput.addEventListener("input", () => {
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
        const created: TagCreation[] = [];
        for (const label of labels) {
          const result = this.createTag(label);
          if (result) created.push(result);
        }
        if (created.length === 0) return;
        this.searchInput!.value = "";
        this.query = "";
        this.afterSelectionChange();
        for (const result of created) {
          if (result.created) this.emitter.emit("create", result.option);
          this.emitter.emit("select", result.option);
        }
        if (this.opts.closeOnSelect) this.close();
        else this.renderList();
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
    if (this.isDisabled) return;
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
    const existing = new Set<string>();
    for (const option of Array.from(this.el.options)) {
      existing.add(option.value);
      option.selected = this.selected.includes(option.value);
    }
    for (const value of this.selected) {
      if (existing.has(value)) continue;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = this.selectedOptions.get(value)?.label ?? value;
      option.selected = true;
      this.el.append(option);
    }
    if (this.opts.sortable && this.opts.multiple) {
      // Re-appending in `this.selected` order moves each selected <option> to
      // the end in that relative order, so a real <select multiple> form
      // submission serializes values in the dragged order (unselected options
      // simply end up interleaved before them, which submission ignores).
      for (const value of this.selected) {
        const option = Array.from(this.el.options).find((o) => o.value === value);
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
    return findDataOption(this.data, value);
  }

  private findOptionByLabel(label: string): Option | undefined {
    const lower = label.toLowerCase();
    const search = (options: Option[]): Option | undefined => {
      for (const option of options) {
        if (option.label.toLowerCase() === lower) return option;
        const found = option.children ? search(option.children) : undefined;
        if (found) return found;
      }
      return undefined;
    };
    for (const item of this.data) {
      const found = search(isGroup(item) ? item.options : [item]);
      if (found) return found;
    }
    return undefined;
  }

  /** Selects an existing option matching `label` exactly, or creates and selects a new one. */
  private createTag(label: string): TagCreation | undefined {
    const trimmed = label.trim();
    if (!trimmed) return undefined;
    const existing = this.findOptionByLabel(trimmed);
    if (existing) {
      if (this.selected.includes(existing.value)) return undefined;
      if (this.opts.multiple && !this.canSelectOption(existing)) {
        this.announceMaximum(existing);
        return undefined;
      }
      this.selectValue(existing.value, false);
      return { option: existing, created: false };
    }
    const option: Option = { value: trimmed, label: trimmed };
    if (this.opts.multiple && !this.canSelectOption(option)) {
      this.announceMaximum(option);
      return undefined;
    }
    this.data.push(option);
    this.selectValue(option.value, false);
    return { option, created: true };
  }

  private createFromQuery(): void {
    const label = this.query.trim();
    if (!label) return;
    const result = this.createTag(label);
    if (!result) return;
    if (this.searchInput) {
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
        this.deselectValue(value, true);
        changed = true;
      } else if (this.canSelectOption(item.option)) {
        this.selectValue(value, true);
        changed = true;
      } else {
        this.announceMaximum(item.option);
      }
      if (changed && this.opts.closeOnSelect) this.close();
    } else {
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
      for (const value of this.selected) {
        const option = this.selectedOptions.get(value) ?? { value, label: value };
        const tag = document.createElement("span");
        tag.className = "forge-select__tag";
        const label = document.createElement("span");
        label.className = "forge-select__tag-label";
        renderOptionContent(label, option, this.opts.templateSelection, "inline");
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "forge-select__tag-remove";
        remove.setAttribute("aria-label", format(this.strings.removeItem, { label: option.label }));
        remove.textContent = "×";
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!this.isDisabled) this.deselectValue(value, true);
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
    } else {
      const option = this.selectedOptions.get(this.selected[0]) ?? {
        value: this.selected[0],
        label: this.selected[0],
      };
      const span = document.createElement("span");
      span.className = "forge-select__single-value";
      renderOptionContent(span, option, this.opts.templateSelection, "inline");
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
    this.rowOffsetsCache = null;
    const trimmedQuery = this.query.trim();
    const query = normalizeSearchText(trimmedQuery, this.opts.accentInsensitive);
    const matches = (option: Option): boolean =>
      query === "" ||
      (this.opts.filterOption
        ? this.opts.filterOption(option, trimmedQuery)
        : this.searchIndex.score(option, trimmedQuery, {
            fields: this.opts.searchFields,
            tokenSearch: this.opts.tokenSearch,
            accentInsensitive: this.opts.accentInsensitive,
            scorer: this.opts.searchScorer,
          }) > 0);

    // A tree node is visible while searching if it matches, or any descendant
    // does (leaf options with no children just reduce to `matches()`).
    const subtreeMatches = (option: Option): boolean =>
      query === "" || matches(option) || (option.children ?? []).some(subtreeMatches);

    const pushOption = (option: Option, depth: number, parentValue?: string): void => {
      let navIndex = -1;
      const interactionDisabled =
        this.isOptionDisabled(option) || (this.hasReachedMaximum() && !this.selected.includes(option.value));
      if (!interactionDisabled) {
        navIndex = this.navItems.length;
        this.navItems.push({ kind: "option", option, parentValue });
      }
      const hasChildren = !!option.children && option.children.length > 0;
      this.rows.push({ kind: "option", option, navIndex, depth, hasChildren });
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
      this.navItems.push({ kind: "create" });
      this.rows.push({ kind: "create", navIndex });
    }

    if (this.rows.length === 0) this.rows.push({ kind: "empty" });
    else if (this.loadingMore) this.rows.push({ kind: "loading-more" });
  }

  private hasExactMatch(lowerQuery: string): boolean {
    return !!this.findOptionByLabel(lowerQuery);
  }

  private usesVirtualScroll(): boolean {
    return this.opts.virtualScroll !== false && this.rows.length > VIRTUAL_THRESHOLD;
  }

  private rowKey(row: Row, index: number): string {
    if (row.kind === "option") return `option:${row.option.value}`;
    if (row.kind === "group") return `group:${row.label}:${index}`;
    return `${row.kind}:${index}`;
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
        while (start < this.rows.length && offsets![start + 1] < scrollTop) start += 1;
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
    for (let i = start; i < end; i++) {
      const element = this.renderRow(this.rows[i]);
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

  private renderRow(row: Row): HTMLLIElement {
    const li = document.createElement("li");
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
        li.id = `${this.uid}-nav-${row.navIndex}`;
        li.dataset.navIndex = String(row.navIndex);
        li.textContent = format(this.strings.createOption, { query: this.query.trim() });
        if (row.navIndex === this.highlightedIndex) li.classList.add("forge-select__option--highlighted");
        break;
      case "option": {
        li.className = "forge-select__option";
        li.dataset.optionValue = row.option.value;
        if (row.option.className) li.classList.add(...row.option.className.trim().split(/\s+/).filter(Boolean));
        li.setAttribute("role", "option");
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
        if (
          this.isOptionDisabled(row.option) ||
          (this.hasReachedMaximum() && !this.selected.includes(row.option.value))
        ) {
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
        break;
      }
    }
    return li;
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
    let cached = this.rowContentCache.get(option.value);
    if (!cached) {
      const holder = document.createElement("span");
      holder.className = "forge-select__option-content";
      renderOptionContent(holder, option, this.opts.templateResult);
      if (this.rowContentCache.size >= ROW_CACHE_LIMIT) {
        // FIFO eviction keeps memory bounded on very large lists.
        const oldest = this.rowContentCache.keys().next().value as string;
        this.rowContentCache.delete(oldest);
      }
      this.rowContentCache.set(option.value, holder);
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

  private updateActiveDescendant(): void {
    const target = this.searchInput ?? this.control;
    if (this.highlightedIndex >= 0) {
      target.setAttribute("aria-activedescendant", `${this.uid}-nav-${this.highlightedIndex}`);
    } else {
      target.removeAttribute("aria-activedescendant");
    }
  }

  // ---------------------------------------------------------------- remote data

  private scheduleRemoteLoad(query: string, delay: number): void {
    if (this.ajaxTimer) clearTimeout(this.ajaxTimer);
    const requestId = ++this.ajaxRequestId;
    this.ajaxController?.abort();
    this.ajaxController = null;
    this.page = 0;
    this.hasMore = true;
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

  private remoteCacheKey(query: string, page: number): string {
    return `${query}\u0000${page}`;
  }

  private async requestRemote(query: string, page: number, signal: AbortSignal): Promise<unknown> {
    const ajax = this.opts.ajax!;
    const attempts = Math.max(0, Math.floor(ajax.retry ?? 0)) + 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        if (ajax.request) return await ajax.request(query, page, signal);
        const response = await fetch(buildUrl(ajax, query, page), { signal });
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
    try {
      const json = await this.requestRemote(query, 0, controller.signal);
      this.remoteCache.set(key, normalizeRemoteResult(ajax, json), ajax.cacheTtl ?? 30000);
    } catch {
      // Prefetch is intentionally best-effort and must not surface UI errors.
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
    try {
      const key = this.remoteCacheKey(query, page);
      let result = this.remoteCache.get(key);
      if (!result) {
        const json = await this.requestRemote(query, page, controller.signal);
        result = normalizeRemoteResult(ajax, json);
        this.remoteCache.set(key, result, ajax.cacheTtl ?? 30000);
      }
      if (activeRequestId !== this.ajaxRequestId || this.destroyed) return;
      const { options, hasMore } = result;

      if (append) {
        const existing = collectValues(this.data);
        this.data = [...this.data, ...options.filter((o) => !existing.has(o.value))];
      } else {
        this.data = options;
        this.rowContentCache.clear();
        this.rowHeightCache.clear();
      }
      this.page = page;
      this.hasMore = hasMore;
      this.remoteLoaded = true;
      this.loadError = null;
    } catch (cause) {
      if (activeRequestId !== this.ajaxRequestId || this.destroyed || controller.signal.aborted) return;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      if (!append) {
        this.data = [];
        this.rowContentCache.clear();
        this.rowHeightCache.clear();
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
