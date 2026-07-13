"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ForgeSelect: () => ForgeSelect,
  default: () => ForgeSelect
});
module.exports = __toCommonJS(index_exports);

// src/emitter.ts
var Emitter = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
  }
  on(event, handler) {
    let set = this.handlers.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
  }
  off(event, handler) {
    this.handlers.get(event)?.delete(handler);
  }
  emit(event, ...args) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) handler(...args);
  }
  clear() {
    this.handlers.clear();
  }
};

// src/i18n.ts
var locales = {
  en: {
    noResults: "No results found",
    loading: "Loading\u2026",
    createOption: 'Create "{query}"',
    clearSelection: "Clear selection",
    removeItem: "Remove {label}",
    search: "Search"
  },
  vi: {
    noResults: "Kh\xF4ng t\xECm th\u1EA5y k\u1EBFt qu\u1EA3",
    loading: "\u0110ang t\u1EA3i\u2026",
    createOption: 'T\u1EA1o "{query}"',
    clearSelection: "X\xF3a l\u1EF1a ch\u1ECDn",
    removeItem: "X\xF3a {label}",
    search: "T\xECm ki\u1EBFm"
  }
};
function getStrings(language) {
  if (typeof language === "string") {
    return locales[language] ?? locales.en;
  }
  return { ...locales.en, ...language };
}
function format(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}

// src/ForgeSelect.ts
var DEFAULT_ITEM_HEIGHT = 36;
var VIRTUAL_BUFFER = 5;
var VIRTUAL_THRESHOLD = 100;
var ROW_CACHE_LIMIT = 2e3;
var uidCounter = 0;
function isGroup(item) {
  return item.options !== void 0;
}
var ForgeSelect = class {
  constructor(target, options = {}) {
    this.selected = [];
    this.selectedOptions = /* @__PURE__ */ new Map();
    this.emitter = new Emitter();
    this.uid = `forge-select-${++uidCounter}`;
    this.searchInput = null;
    this.isOpen = false;
    this.isDisabled = false;
    this.destroyed = false;
    this.query = "";
    this.rows = [];
    this.navItems = [];
    this.highlightedIndex = -1;
    this.rowContentCache = /* @__PURE__ */ new Map();
    this.loading = false;
    this.ajaxTimer = null;
    this.ajaxRequestId = 0;
    this.remoteLoaded = false;
    this.onDocumentMouseDown = (event) => {
      if (!this.root.contains(event.target)) this.close();
    };
    const el = typeof target === "string" ? document.querySelector(target) : target;
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
      plugins: options.plugins ?? []
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
  open() {
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
  close() {
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
  destroy() {
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
  getValue() {
    if (this.opts.multiple) return [...this.selected];
    return this.selected[0] ?? null;
  }
  setValue(value) {
    const values = value == null ? [] : Array.isArray(value) ? value : [value];
    const next = this.opts.multiple ? values : values.slice(0, 1);
    if (arraysEqual(next, this.selected)) return;
    this.selected = [];
    for (const v of next) this.selectValue(v, false);
    this.afterSelectionChange();
  }
  enable() {
    this.isDisabled = false;
    this.root.classList.remove("forge-select--disabled");
    this.control.tabIndex = 0;
    this.control.setAttribute("aria-disabled", "false");
  }
  disable() {
    this.close();
    this.isDisabled = true;
    this.root.classList.add("forge-select--disabled");
    this.control.tabIndex = -1;
    this.control.setAttribute("aria-disabled", "true");
  }
  on(event, handler) {
    this.emitter.on(event, handler);
  }
  off(event, handler) {
    this.emitter.off(event, handler);
  }
  // ---------------------------------------------------------------- DOM setup
  buildDom() {
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
    this.clearBtn.textContent = "\xD7";
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
  bindEvents() {
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
        this.query = this.searchInput.value;
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
      const li = event.target.closest("li[data-nav-index]");
      if (!li) return;
      const navIndex = Number(li.dataset.navIndex);
      this.activateNavItem(navIndex);
    });
    this.list.addEventListener("scroll", () => {
      if (this.usesVirtualScroll()) this.renderRows();
    });
  }
  handleKeydown(event) {
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
  selectValue(value, notify) {
    if (this.selected.includes(value)) return;
    const option = this.findOption(value) ?? this.selectedOptions.get(value) ?? { value, label: value };
    this.selectedOptions.set(value, option);
    if (this.opts.multiple) this.selected.push(value);
    else this.selected = [value];
    if (notify) this.afterSelectionChange();
  }
  deselectValue(value, notify) {
    const index = this.selected.indexOf(value);
    if (index === -1) return;
    this.selected.splice(index, 1);
    if (notify) this.afterSelectionChange();
  }
  clearSelection() {
    if (this.selected.length === 0) return;
    this.selected = [];
    this.emitter.emit("clear");
    this.afterSelectionChange();
  }
  afterSelectionChange() {
    this.renderValue();
    this.syncNativeSelect();
    if (this.isOpen) this.renderList();
    this.emitter.emit("change", this.getValue());
  }
  syncNativeSelect() {
    if (!(this.el instanceof HTMLSelectElement)) return;
    const existing = /* @__PURE__ */ new Set();
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
  findOption(value) {
    for (const item of this.data) {
      if (isGroup(item)) {
        const found = item.options.find((o) => o.value === value);
        if (found) return found;
      } else if (item.value === value) {
        return item;
      }
    }
    return void 0;
  }
  createFromQuery() {
    const label = this.query.trim();
    if (!label) return;
    const option = { value: label, label };
    this.data.push(option);
    if (this.searchInput) {
      this.searchInput.value = "";
      this.query = "";
    }
    this.selectValue(option.value, true);
    if (!this.opts.multiple) this.close();
  }
  activateNavItem(navIndex) {
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
  renderValue() {
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
        remove.textContent = "\xD7";
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
        label: this.selected[0]
      };
      const span = document.createElement("span");
      span.className = "forge-select__single-value";
      this.renderTemplate(span, option, this.opts.templateSelection, "inline");
      this.valueEl.append(span);
    }
  }
  renderTemplate(container, option, template, variant = "row") {
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
    if (option.avatar) {
      const avatar = document.createElement("img");
      avatar.className = variant === "row" ? "forge-select__option-avatar" : "forge-select__inline-avatar";
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
  buildRows() {
    this.rows = [];
    this.navItems = [];
    const query = this.query.trim().toLowerCase();
    const matches = (option) => query === "" || option.label.toLowerCase().includes(query) || (option.description?.toLowerCase().includes(query) ?? false);
    const pushOption = (option) => {
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
  hasExactMatch(lowerQuery) {
    for (const item of this.data) {
      const options = isGroup(item) ? item.options : [item];
      if (options.some((o) => o.label.toLowerCase() === lowerQuery)) return true;
    }
    return false;
  }
  usesVirtualScroll() {
    return this.opts.virtualScroll !== false && this.rows.length > VIRTUAL_THRESHOLD;
  }
  renderList() {
    this.buildRows();
    this.renderRows();
  }
  renderRows() {
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
      if (this.list.scrollTop !== scrollTop) {
        this.list.scrollTop = scrollTop;
      }
    }
    this.updateActiveDescendant();
  }
  renderRow(row) {
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
  optionContent(option) {
    let cached = this.rowContentCache.get(option.value);
    if (!cached) {
      const holder = document.createElement("span");
      holder.className = "forge-select__option-content";
      this.renderTemplate(holder, option, this.opts.templateResult);
      if (this.rowContentCache.size >= ROW_CACHE_LIMIT) {
        const oldest = this.rowContentCache.keys().next().value;
        this.rowContentCache.delete(oldest);
      }
      this.rowContentCache.set(option.value, holder);
      cached = holder;
    }
    return cached.cloneNode(true);
  }
  moveHighlight(delta) {
    if (this.navItems.length === 0) return;
    const next = this.highlightedIndex === -1 && delta > 0 ? 0 : (this.highlightedIndex + delta + this.navItems.length) % this.navItems.length;
    this.highlightedIndex = next;
    if (this.usesVirtualScroll()) {
      const rowIndex = this.rows.findIndex(
        (row) => (row.kind === "option" || row.kind === "create") && row.navIndex === next
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
      const highlighted = this.list.querySelector(".forge-select__option--highlighted");
      highlighted?.scrollIntoView?.({ block: "nearest" });
    }
  }
  updateActiveDescendant() {
    const target = this.searchInput ?? this.control;
    if (this.highlightedIndex >= 0) {
      target.setAttribute("aria-activedescendant", `${this.uid}-nav-${this.highlightedIndex}`);
    } else {
      target.removeAttribute("aria-activedescendant");
    }
  }
  // ---------------------------------------------------------------- remote data
  scheduleRemoteLoad(query, delay) {
    if (this.ajaxTimer) clearTimeout(this.ajaxTimer);
    this.loading = true;
    this.renderList();
    this.ajaxTimer = setTimeout(() => {
      void this.loadRemote(query);
    }, delay);
  }
  async loadRemote(query) {
    const ajax = this.opts.ajax;
    const requestId = ++this.ajaxRequestId;
    try {
      const url = buildUrl(ajax, query);
      const response = await fetch(url);
      const json = await response.json();
      if (requestId !== this.ajaxRequestId || this.destroyed) return;
      this.data = ajax.transform ? ajax.transform(json) : json;
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
};
function parseNativeOptions(select) {
  const data = [];
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      data.push({
        label: child.label,
        options: Array.from(child.querySelectorAll("option")).map(parseOption)
      });
    } else if (child instanceof HTMLOptionElement) {
      data.push(parseOption(child));
    }
  }
  return data;
}
function parseOption(option) {
  return {
    value: option.value,
    label: option.textContent?.trim() ?? option.value,
    disabled: option.disabled || void 0
  };
}
function buildUrl(ajax, query) {
  if (typeof ajax.url === "function") return ajax.url(query);
  if (!ajax.params) return ajax.url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ajax.params(query))) {
    params.set(key, String(value));
  }
  const separator = ajax.url.includes("?") ? "&" : "?";
  return `${ajax.url}${separator}${params.toString()}`;
}
function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ForgeSelect
});
//# sourceMappingURL=index.cjs.map