import { Emitter, type Handler } from "./emitter";
import { format, getStrings, type Strings } from "./i18n";
import type {
  AjaxConfig,
  DataItem,
  ForgeSelectEvent,
  ForgeSelectOptions,
  ForgeSelectPlugin,
  ForgeSelectValue,
  Option,
  OptionGroup,
  TemplateFn,
} from "./types";

type Row =
  | { kind: "group"; label: string }
  | { kind: "option"; option: Option; navIndex: number }
  | { kind: "create"; navIndex: number }
  | { kind: "empty" }
  | { kind: "loading" };

type NavItem = { kind: "option"; option: Option } | { kind: "create" };

interface ResolvedOptions {
  placeholder: string;
  searchable: boolean;
  multiple: boolean;
  clearable: boolean;
  allowCreate: boolean;
  theme: string;
  disabled: boolean;
  data?: DataItem[];
  ajax?: AjaxConfig;
  templateResult?: TemplateFn;
  templateSelection?: TemplateFn;
  virtualScroll: boolean | undefined;
  itemHeight: number;
  language: string | Record<string, string>;
  plugins: ForgeSelectPlugin[];
}

const DEFAULT_ITEM_HEIGHT = 36;
const VIRTUAL_BUFFER = 5;
const VIRTUAL_THRESHOLD = 100;
const ROW_CACHE_LIMIT = 2000;

let uidCounter = 0;

function isGroup(item: DataItem): item is OptionGroup {
  return (item as OptionGroup).options !== undefined;
}

export default class ForgeSelect {
  /** The original element ForgeSelect was mounted on. */
  readonly el: HTMLElement;

  private opts: ResolvedOptions;
  private strings: Strings;
  private data: DataItem[];
  private selected: string[] = [];
  private selectedOptions = new Map<string, Option>();
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

  private isOpen = false;
  private isDisabled = false;
  private destroyed = false;
  private query = "";
  private rows: Row[] = [];
  private navItems: NavItem[] = [];
  private highlightedIndex = -1;
  private rowContentCache = new Map<string, Node>();

  private loading = false;
  private ajaxTimer: ReturnType<typeof setTimeout> | null = null;
  private ajaxRequestId = 0;
  private remoteLoaded = false;

  private onDocumentMouseDown = (event: MouseEvent): void => {
    if (!this.root.contains(event.target as Node)) this.close();
  };

  constructor(target: string | HTMLElement, options: ForgeSelectOptions = {}) {
    const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
    if (!el) {
      throw new Error(`ForgeSelect: target element not found: ${String(target)}`);
    }
    this.el = el;

    const nativeSelect = el instanceof HTMLSelectElement ? el : null;
    this.opts = {
      placeholder: options.placeholder ?? "",
      searchable: options.searchable ?? true,
      multiple: options.multiple ?? nativeSelect?.multiple ?? false,
      clearable: options.clearable ?? false,
      allowCreate: options.allowCreate ?? false,
      theme: options.theme ?? "default",
      disabled: options.disabled ?? false,
      data: options.data,
      ajax: options.ajax,
      templateResult: options.templateResult,
      templateSelection: options.templateSelection,
      virtualScroll: options.virtualScroll,
      itemHeight: options.itemHeight ?? DEFAULT_ITEM_HEIGHT,
      language: options.language ?? "en",
      plugins: options.plugins ?? [],
    };
    this.strings = getStrings(this.opts.language);
    this.plugins = this.opts.plugins;

    this.data = this.opts.data ?? (nativeSelect ? parseNativeOptions(nativeSelect) : []);
    if (nativeSelect && !this.opts.data) {
      for (const option of Array.from(nativeSelect.querySelectorAll("option"))) {
        if (option.hasAttribute("selected")) this.selectValue(option.value, false);
      }
    }

    this.buildDom();
    this.renderValue();
    if (this.opts.disabled) this.disable();

    for (const plugin of this.plugins) plugin.onInit?.(this);
  }

  // ---------------------------------------------------------------- public API

  open(): void {
    if (this.isOpen || this.isDisabled || this.destroyed) return;
    this.isOpen = true;
    this.dropdown.hidden = false;
    this.root.classList.add("forge-select--open");
    this.control.setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", this.onDocumentMouseDown);

    if (this.opts.ajax && !this.remoteLoaded) {
      this.scheduleRemoteLoad(this.query, 0);
    }
    this.renderList();
    if (this.searchInput) this.searchInput.focus();

    this.emitter.emit("open");
    for (const plugin of this.plugins) plugin.onOpen?.(this);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dropdown.hidden = true;
    this.root.classList.remove("forge-select--open");
    this.control.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", this.onDocumentMouseDown);
    this.highlightedIndex = -1;
    if (this.searchInput) {
      this.searchInput.value = "";
      this.query = "";
    }

    this.emitter.emit("close");
    for (const plugin of this.plugins) plugin.onClose?.(this);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.close();
    for (const plugin of this.plugins) plugin.onDestroy?.(this);
    this.destroyed = true;
    if (this.ajaxTimer) clearTimeout(this.ajaxTimer);
    this.rowContentCache.clear();
    this.root.remove();
    this.el.style.display = "";
    this.emitter.clear();
  }

  getValue(): ForgeSelectValue {
    if (this.opts.multiple) return [...this.selected];
    return this.selected[0] ?? null;
  }

  setValue(value: ForgeSelectValue): void {
    const values = value == null ? [] : Array.isArray(value) ? value : [value];
    const next = this.opts.multiple ? values : values.slice(0, 1);
    if (arraysEqual(next, this.selected)) return;
    this.selected = [];
    for (const v of next) this.selectValue(v, false);
    this.afterSelectionChange();
  }

  enable(): void {
    this.isDisabled = false;
    this.root.classList.remove("forge-select--disabled");
    this.control.tabIndex = 0;
    this.control.setAttribute("aria-disabled", "false");
  }

  disable(): void {
    this.close();
    this.isDisabled = true;
    this.root.classList.add("forge-select--disabled");
    this.control.tabIndex = -1;
    this.control.setAttribute("aria-disabled", "true");
  }

  on(event: ForgeSelectEvent, handler: Handler): void {
    this.emitter.on(event, handler);
  }

  off(event: ForgeSelectEvent, handler: Handler): void {
    this.emitter.off(event, handler);
  }

  // ---------------------------------------------------------------- DOM setup

  private buildDom(): void {
    this.root = document.createElement("div");
    this.root.className = "forge-select";
    this.root.dataset.theme = this.opts.theme;
    this.root.style.setProperty("--fs-item-height", `${this.opts.itemHeight}px`);

    this.control = document.createElement("div");
    this.control.className = "forge-select__control";
    this.control.setAttribute("role", "combobox");
    this.control.setAttribute("aria-haspopup", "listbox");
    this.control.setAttribute("aria-expanded", "false");
    this.control.setAttribute("aria-controls", `${this.uid}-list`);
    this.control.tabIndex = 0;

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
      this.dropdown.append(this.searchInput);
    }

    this.list = document.createElement("ul");
    this.list.className = "forge-select__list";
    this.list.id = `${this.uid}-list`;
    this.list.setAttribute("role", "listbox");
    if (this.opts.multiple) this.list.setAttribute("aria-multiselectable", "true");
    this.dropdown.append(this.list);

    this.root.append(this.control, this.dropdown);
    this.el.style.display = "none";
    this.el.insertAdjacentElement("afterend", this.root);

    this.bindEvents();
  }

  private bindEvents(): void {
    this.control.addEventListener("click", (event) => {
      if (event.target === this.clearBtn) return;
      if (this.isDisabled) return;
      this.isOpen ? this.close() : this.open();
    });

    this.control.addEventListener("keydown", (event) => this.handleKeydown(event));

    this.clearBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.clearSelection();
    });

    if (this.searchInput) {
      this.searchInput.addEventListener("input", () => {
        this.query = this.searchInput!.value;
        this.highlightedIndex = -1;
        this.list.scrollTop = 0;
        this.emitter.emit("search", this.query);
        if (this.opts.ajax) {
          this.scheduleRemoteLoad(this.query, this.opts.ajax.debounce ?? 250);
        } else {
          this.renderList();
        }
      });
      this.searchInput.addEventListener("keydown", (event) => this.handleKeydown(event));
    }

    this.list.addEventListener("click", (event) => {
      const li = (event.target as HTMLElement).closest<HTMLLIElement>("li[data-nav-index]");
      if (!li) return;
      const navIndex = Number(li.dataset.navIndex);
      this.activateNavItem(navIndex);
    });

    this.list.addEventListener("scroll", () => {
      if (this.usesVirtualScroll()) this.renderRows();
    });
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
      case "Tab":
        this.close();
        break;
    }
  }

  // ---------------------------------------------------------------- selection

  private selectValue(value: string, notify: boolean): void {
    if (this.selected.includes(value)) return;
    const option = this.findOption(value) ?? this.selectedOptions.get(value) ?? { value, label: value };
    this.selectedOptions.set(value, option);
    if (this.opts.multiple) this.selected.push(value);
    else this.selected = [value];
    if (notify) this.afterSelectionChange();
  }

  private deselectValue(value: string, notify: boolean): void {
    const index = this.selected.indexOf(value);
    if (index === -1) return;
    this.selected.splice(index, 1);
    if (notify) this.afterSelectionChange();
  }

  private clearSelection(): void {
    if (this.selected.length === 0) return;
    this.selected = [];
    this.emitter.emit("clear");
    this.afterSelectionChange();
  }

  private afterSelectionChange(): void {
    this.renderValue();
    this.syncNativeSelect();
    if (this.isOpen) this.renderList();
    this.emitter.emit("change", this.getValue());
  }

  private syncNativeSelect(): void {
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
    this.el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  private findOption(value: string): Option | undefined {
    for (const item of this.data) {
      if (isGroup(item)) {
        const found = item.options.find((o) => o.value === value);
        if (found) return found;
      } else if (item.value === value) {
        return item;
      }
    }
    return undefined;
  }

  private createFromQuery(): void {
    const label = this.query.trim();
    if (!label) return;
    const option: Option = { value: label, label };
    this.data.push(option);
    if (this.searchInput) {
      this.searchInput.value = "";
      this.query = "";
    }
    this.selectValue(option.value, true);
    if (!this.opts.multiple) this.close();
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
      this.selected.includes(value) ? this.deselectValue(value, true) : this.selectValue(value, true);
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
        this.renderTemplate(label, option, this.opts.templateSelection, "inline");
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
        this.valueEl.append(tag);
      }
    } else {
      const option = this.selectedOptions.get(this.selected[0]) ?? {
        value: this.selected[0],
        label: this.selected[0],
      };
      const span = document.createElement("span");
      span.className = "forge-select__single-value";
      this.renderTemplate(span, option, this.opts.templateSelection, "inline");
      this.valueEl.append(span);
    }
  }

  private renderTemplate(
    container: HTMLElement,
    option: Option,
    template?: TemplateFn,
    variant: "row" | "inline" = "row",
  ): void {
    if (template) {
      const result = template(option);
      if (typeof result === "string") container.innerHTML = result;
      else container.append(result);
      return;
    }
    if (!option.avatar && !option.description) {
      container.textContent = option.label;
      return;
    }
    // Built-in rich renderer: DOM built via textContent, so all fields are XSS-safe.
    if (option.avatar) {
      const avatar = document.createElement("img");
      avatar.className =
        variant === "row" ? "forge-select__option-avatar" : "forge-select__inline-avatar";
      avatar.src = option.avatar;
      avatar.alt = "";
      avatar.setAttribute("loading", "lazy");
      avatar.setAttribute("decoding", "async");
      container.append(avatar);
    }
    if (variant === "row" && option.description) {
      const body = document.createElement("span");
      body.className = "forge-select__option-body";
      const label = document.createElement("span");
      label.className = "forge-select__option-label";
      label.textContent = option.label;
      const desc = document.createElement("span");
      desc.className = "forge-select__option-desc";
      desc.textContent = option.description;
      body.append(label, desc);
      container.append(body);
    } else {
      const label = document.createElement("span");
      label.className = "forge-select__option-label";
      label.textContent = option.label;
      container.append(label);
    }
  }

  private buildRows(): void {
    this.rows = [];
    this.navItems = [];
    const query = this.query.trim().toLowerCase();
    const matches = (option: Option): boolean =>
      query === "" ||
      option.label.toLowerCase().includes(query) ||
      (option.description?.toLowerCase().includes(query) ?? false);

    const pushOption = (option: Option): void => {
      let navIndex = -1;
      if (!option.disabled) {
        navIndex = this.navItems.length;
        this.navItems.push({ kind: "option", option });
      }
      this.rows.push({ kind: "option", option, navIndex });
    };

    if (this.loading) {
      this.rows.push({ kind: "loading" });
      return;
    }

    for (const item of this.data) {
      if (isGroup(item)) {
        const visible = item.options.filter(matches);
        if (visible.length === 0) continue;
        this.rows.push({ kind: "group", label: item.label });
        visible.forEach(pushOption);
      } else if (matches(item)) {
        pushOption(item);
      }
    }

    if (this.opts.allowCreate && query !== "" && !this.hasExactMatch(query)) {
      const navIndex = this.navItems.length;
      this.navItems.push({ kind: "create" });
      this.rows.push({ kind: "create", navIndex });
    }

    if (this.rows.length === 0) this.rows.push({ kind: "empty" });
  }

  private hasExactMatch(lowerQuery: string): boolean {
    for (const item of this.data) {
      const options = isGroup(item) ? item.options : [item];
      if (options.some((o) => o.label.toLowerCase() === lowerQuery)) return true;
    }
    return false;
  }

  private usesVirtualScroll(): boolean {
    return this.opts.virtualScroll !== false && this.rows.length > VIRTUAL_THRESHOLD;
  }

  private renderList(): void {
    this.buildRows();
    this.renderRows();
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
    let start = 0;
    let end = this.rows.length;
    if (virtual) {
      const viewport = clientHeight || rowHeight * 8;
      start = Math.max(0, Math.floor(scrollTop / rowHeight) - VIRTUAL_BUFFER);
      end = Math.min(this.rows.length, start + Math.ceil(viewport / rowHeight) + VIRTUAL_BUFFER * 2);

      const topSpacer = document.createElement("li");
      topSpacer.className = "forge-select__spacer";
      topSpacer.setAttribute("aria-hidden", "true");
      topSpacer.style.height = `${start * rowHeight}px`;
      this.list.append(topSpacer);
    }

    for (let i = start; i < end; i++) {
      this.list.append(this.renderRow(this.rows[i]));
    }

    if (virtual) {
      const bottomSpacer = document.createElement("li");
      bottomSpacer.className = "forge-select__spacer";
      bottomSpacer.setAttribute("aria-hidden", "true");
      bottomSpacer.style.height = `${(this.rows.length - end) * rowHeight}px`;
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
        li.textContent = this.strings.noResults;
        break;
      case "loading":
        li.className = "forge-select__loading";
        li.textContent = this.strings.loading;
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
        li.setAttribute("role", "option");
        const isSelected = this.selected.includes(row.option.value);
        li.setAttribute("aria-selected", String(isSelected));
        if (isSelected) li.classList.add("forge-select__option--selected");
        if (row.option.disabled) {
          li.classList.add("forge-select__option--disabled");
          li.setAttribute("aria-disabled", "true");
        } else {
          li.id = `${this.uid}-nav-${row.navIndex}`;
          li.dataset.navIndex = String(row.navIndex);
          if (row.navIndex === this.highlightedIndex) li.classList.add("forge-select__option--highlighted");
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
    let cached = this.rowContentCache.get(option.value);
    if (!cached) {
      const holder = document.createElement("span");
      holder.className = "forge-select__option-content";
      this.renderTemplate(holder, option, this.opts.templateResult);
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
      this.highlightedIndex === -1 && delta > 0
        ? 0
        : (this.highlightedIndex + delta + this.navItems.length) % this.navItems.length;
    this.highlightedIndex = next;

    if (this.usesVirtualScroll()) {
      const rowIndex = this.rows.findIndex(
        (row) => (row.kind === "option" || row.kind === "create") && row.navIndex === next,
      );
      if (rowIndex >= 0) {
        const rowHeight = this.opts.itemHeight;
        const top = rowIndex * rowHeight;
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
    this.loading = true;
    this.renderList();
    this.ajaxTimer = setTimeout(() => {
      void this.loadRemote(query);
    }, delay);
  }

  private async loadRemote(query: string): Promise<void> {
    const ajax = this.opts.ajax!;
    const requestId = ++this.ajaxRequestId;
    try {
      const url = buildUrl(ajax, query);
      const response = await fetch(url);
      const json: unknown = await response.json();
      if (requestId !== this.ajaxRequestId || this.destroyed) return;
      this.data = ajax.transform ? ajax.transform(json) : (json as Option[]);
      this.rowContentCache.clear();
      this.remoteLoaded = true;
    } catch {
      if (requestId !== this.ajaxRequestId || this.destroyed) return;
      this.data = [];
      this.rowContentCache.clear();
    } finally {
      if (requestId === this.ajaxRequestId && !this.destroyed) {
        this.loading = false;
        if (this.isOpen) this.renderList();
      }
    }
  }
}

function parseNativeOptions(select: HTMLSelectElement): DataItem[] {
  const data: DataItem[] = [];
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      data.push({
        label: child.label,
        options: Array.from(child.querySelectorAll("option")).map(parseOption),
      });
    } else if (child instanceof HTMLOptionElement) {
      data.push(parseOption(child));
    }
  }
  return data;
}

function parseOption(option: HTMLOptionElement): Option {
  return {
    value: option.value,
    label: option.textContent?.trim() ?? option.value,
    disabled: option.disabled || undefined,
  };
}

function buildUrl(ajax: AjaxConfig, query: string): string {
  if (typeof ajax.url === "function") return ajax.url(query);
  if (!ajax.params) return ajax.url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ajax.params(query))) {
    params.set(key, String(value));
  }
  const separator = ajax.url.includes("?") ? "&" : "?";
  return `${ajax.url}${separator}${params.toString()}`;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
