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
  | { kind: "option"; option: Option; navIndex: number; depth: number; hasChildren: boolean }
  | { kind: "create"; navIndex: number }
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "loading-more" };

type NavItem = { kind: "option"; option: Option } | { kind: "create" };

interface ResolvedOptions {
  placeholder: string;
  searchable: boolean;
  multiple: boolean;
  clearable: boolean;
  allowCreate: boolean;
  sortable: boolean;
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

/** All descendant values under `option` (children, recursively), not including `option` itself. */
function collectDescendantValues(option: Option): string[] {
  if (!option.children) return [];
  const values: string[] = [];
  for (const child of option.children) {
    values.push(child.value, ...collectDescendantValues(child));
  }
  return values;
}

/**
 * Tri-state checkbox state for a tree node, derived purely from `selected`:
 * "all"/"none" if every (or no) leaf descendant is selected, "some" otherwise.
 * Leaf options (no children) are just "all"/"none" based on their own value.
 */
function computeCheckState(option: Option, selected: string[]): "none" | "some" | "all" {
  if (!option.children || option.children.length === 0) {
    return selected.includes(option.value) ? "all" : "none";
  }
  const states = option.children.map((child) => computeCheckState(child, selected));
  if (states.every((s) => s === "all")) return "all";
  if (states.every((s) => s === "none")) return "none";
  return "some";
}

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

  private isOpen = false;
  private isDisabled = false;
  private destroyed = false;
  private query = "";
  private rows: Row[] = [];
  private navItems: NavItem[] = [];
  private highlightedIndex = -1;
  private rowContentCache = new Map<string, Node>();
  private expandedValues = new Set<string>();

  private loading = false;
  private loadingMore = false;
  private page = 0;
  private hasMore = true;
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
      sortable: options.sortable ?? false,
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
    if (this.opts.sortable && this.opts.multiple) this.root.classList.add("forge-select--sortable");

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
      if (this.suppressNextTagClick) {
        this.suppressNextTagClick = false;
        return;
      }
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
      if (!li) return;
      const navIndex = Number(li.dataset.navIndex);
      this.activateNavItem(navIndex);
    });

    this.list.addEventListener("scroll", () => {
      if (this.usesVirtualScroll()) this.renderRows();
      this.maybeLoadNextPage();
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
    if (this.opts.multiple) {
      this.selected.push(value);
      // Selecting a tree node cascades to its descendants too; for a plain
      // option (no children) this is a no-op.
      for (const v of collectDescendantValues(option)) {
        if (!this.selected.includes(v)) this.selected.push(v);
      }
      this.syncTreeAncestors();
    } else {
      this.selected = [value];
    }
    if (notify) this.afterSelectionChange();
  }

  private deselectValue(value: string, notify: boolean): void {
    const index = this.selected.indexOf(value);
    if (index === -1) return;
    this.selected.splice(index, 1);
    if (this.opts.multiple) {
      const option = this.findOption(value) ?? this.selectedOptions.get(value);
      if (option) {
        for (const v of collectDescendantValues(option)) {
          const i = this.selected.indexOf(v);
          if (i !== -1) this.selected.splice(i, 1);
        }
      }
      this.syncTreeAncestors();
    }
    if (notify) this.afterSelectionChange();
  }

  /**
   * Keeps every tree parent's own membership in `selected` consistent with
   * its descendants (post-order, so parents see already-corrected children):
   * a parent counts as selected only when `computeCheckState` says "all".
   * No-op for data with no `children` anywhere.
   */
  private syncTreeAncestors(): void {
    const sync = (option: Option): void => {
      if (!option.children || option.children.length === 0) return;
      for (const child of option.children) sync(child);
      const state = computeCheckState(option, this.selected);
      const index = this.selected.indexOf(option.value);
      if (state === "all" && index === -1) this.selected.push(option.value);
      else if (state !== "all" && index !== -1) this.selected.splice(index, 1);
    };
    for (const item of this.data) {
      const options = isGroup(item) ? item.options : [item];
      options.forEach(sync);
    }
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
    this.el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  private findOption(value: string): Option | undefined {
    const search = (options: Option[]): Option | undefined => {
      for (const option of options) {
        if (option.value === value) return option;
        if (option.children) {
          const found = search(option.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    for (const item of this.data) {
      const found = search(isGroup(item) ? item.options : [item]);
      if (found) return found;
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
      this.renderTemplate(span, option, this.opts.templateSelection, "inline");
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

    // A tree node is visible while searching if it matches, or any descendant
    // does (leaf options with no children just reduce to `matches()`).
    const subtreeMatches = (option: Option): boolean =>
      query === "" || matches(option) || (option.children ?? []).some(subtreeMatches);

    const pushOption = (option: Option, depth: number): void => {
      let navIndex = -1;
      if (!option.disabled) {
        navIndex = this.navItems.length;
        this.navItems.push({ kind: "option", option });
      }
      const hasChildren = !!option.children && option.children.length > 0;
      this.rows.push({ kind: "option", option, navIndex, depth, hasChildren });
      if (hasChildren) {
        // Expanding is ephemeral while searching (never written to
        // expandedValues), so clearing the query restores manual state.
        const expanded = query !== "" || this.expandedValues.has(option.value);
        if (expanded) {
          for (const child of option.children!) {
            if (subtreeMatches(child)) pushOption(child, depth + 1);
          }
        }
      }
    };

    if (this.loading) {
      this.rows.push({ kind: "loading" });
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
    const matchesExactly = (option: Option): boolean =>
      option.label.toLowerCase() === lowerQuery || (option.children ?? []).some(matchesExactly);
    for (const item of this.data) {
      const options = isGroup(item) ? item.options : [item];
      if (options.some(matchesExactly)) return true;
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
        li.setAttribute("role", "option");
        const isSelected = this.selected.includes(row.option.value);
        li.setAttribute("aria-selected", String(isSelected));
        if (isSelected) li.classList.add("forge-select__option--selected");
        if (this.opts.multiple && row.hasChildren && computeCheckState(row.option, this.selected) === "some") {
          li.classList.add("forge-select__option--indeterminate");
        }
        if (row.depth > 0) {
          li.style.paddingLeft = `calc(12px + ${row.depth} * var(--fs-tree-indent, 18px))`;
        }
        if (row.option.disabled) {
          li.classList.add("forge-select__option--disabled");
          li.setAttribute("aria-disabled", "true");
        } else {
          li.id = `${this.uid}-nav-${row.navIndex}`;
          li.dataset.navIndex = String(row.navIndex);
          if (row.navIndex === this.highlightedIndex) li.classList.add("forge-select__option--highlighted");
        }
        if (row.hasChildren) {
          const twisty = document.createElement("span");
          twisty.className = "forge-select__twisty";
          twisty.dataset.twisty = row.option.value;
          twisty.setAttribute("aria-hidden", "true");
          twisty.textContent = this.expandedValues.has(row.option.value) ? "▼" : "▶";
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
    this.page = 0;
    this.hasMore = true;
    this.loading = true;
    this.renderList();
    this.ajaxTimer = setTimeout(() => {
      void this.loadRemote(query);
    }, delay);
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

  private async loadRemote(query: string, { append = false }: { append?: boolean } = {}): Promise<void> {
    const ajax = this.opts.ajax!;
    const requestId = ++this.ajaxRequestId;
    const page = append ? this.page + 1 : 0;
    try {
      const url = buildUrl(ajax, query, page);
      const response = await fetch(url);
      const json: unknown = await response.json();
      if (requestId !== this.ajaxRequestId || this.destroyed) return;
      const result = ajax.transform ? ajax.transform(json) : (json as Option[]);
      const options = Array.isArray(result) ? result : result.options;
      const hasMore = ajax.pagination ? (Array.isArray(result) ? false : result.hasMore) : false;

      if (append) {
        const existing = collectValues(this.data);
        this.data = [...this.data, ...options.filter((o) => !existing.has(o.value))];
      } else {
        this.data = options;
        this.rowContentCache.clear();
      }
      this.page = page;
      this.hasMore = hasMore;
      this.remoteLoaded = true;
    } catch {
      if (requestId !== this.ajaxRequestId || this.destroyed) return;
      if (!append) {
        this.data = [];
        this.rowContentCache.clear();
      }
      this.hasMore = false;
    } finally {
      if (requestId === this.ajaxRequestId && !this.destroyed) {
        this.loading = false;
        this.loadingMore = false;
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

function buildUrl(ajax: AjaxConfig, query: string, page: number): string {
  if (typeof ajax.url === "function") return ajax.url(query);
  if (!ajax.params) return ajax.url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ajax.params(query, page))) {
    params.set(key, String(value));
  }
  const separator = ajax.url.includes("?") ? "&" : "?";
  return `${ajax.url}${separator}${params.toString()}`;
}

function collectValues(items: DataItem[]): Set<string> {
  const values = new Set<string>();
  for (const item of items) {
    if (isGroup(item)) {
      for (const option of item.options) values.add(option.value);
    } else {
      values.add(item.value);
    }
  }
  return values;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
