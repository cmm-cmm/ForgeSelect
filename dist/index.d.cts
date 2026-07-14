type Handler = (...args: unknown[]) => void;

interface Option {
    value: string;
    label: string;
    disabled?: boolean;
    /** Image URL or data URI rendered as a round avatar next to the label. */
    avatar?: string;
    /** Secondary line rendered under the label in the dropdown. */
    description?: string;
    /** Arbitrary payload for custom templates; ForgeSelect never reads it. */
    meta?: Record<string, unknown>;
    /**
     * Nested options, making this a tree node. Purely additive: lists where
     * no option has `children` render and behave exactly as a flat list.
     */
    children?: Option[];
}
interface OptionGroup {
    label: string;
    options: Option[];
}
type DataItem = Option | OptionGroup;
interface AjaxConfig {
    url: string | ((query: string) => string);
    params?: (query: string, page: number) => Record<string, unknown>;
    /** Debounce in milliseconds. Default 250. */
    debounce?: number;
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
    transform?: (response: unknown) => Option[] | {
        options: Option[];
        hasMore: boolean;
    };
}
interface ForgeSelectPlugin {
    name: string;
    onInit?(select: ForgeSelect): void;
    onOpen?(select: ForgeSelect): void;
    onClose?(select: ForgeSelect): void;
    onDestroy?(select: ForgeSelect): void;
}
type TemplateFn = (option: Option) => string | Node;
interface ForgeSelectOptions {
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
    theme?: string;
    disabled?: boolean;
    data?: DataItem[];
    ajax?: AjaxConfig;
    templateResult?: TemplateFn;
    templateSelection?: TemplateFn;
    /**
     * false = never virtualize. true or unset = virtualize automatically
     * once the list exceeds ~100 rows.
     */
    virtualScroll?: boolean;
    /** Row height in px used by the virtual scroller. Default 36; raise for rich items. */
    itemHeight?: number;
    language?: string | Record<string, string>;
    plugins?: ForgeSelectPlugin[];
}
type ForgeSelectValue = string | string[] | null;
type ForgeSelectEvent = "change" | "open" | "close" | "search" | "clear";

declare class ForgeSelect {
    /** The original element ForgeSelect was mounted on. */
    readonly el: HTMLElement;
    private opts;
    private strings;
    private data;
    private selected;
    private selectedOptions;
    private suppressNextTagClick;
    private emitter;
    private plugins;
    private uid;
    private root;
    private control;
    private valueEl;
    private clearBtn;
    private dropdown;
    private searchInput;
    private list;
    private isOpen;
    private isDisabled;
    private destroyed;
    private query;
    private rows;
    private navItems;
    private highlightedIndex;
    private rowContentCache;
    private expandedValues;
    private loading;
    private loadingMore;
    private page;
    private hasMore;
    private ajaxTimer;
    private ajaxRequestId;
    private remoteLoaded;
    private onDocumentMouseDown;
    constructor(target: string | HTMLElement, options?: ForgeSelectOptions);
    open(): void;
    close(): void;
    destroy(): void;
    getValue(): ForgeSelectValue;
    setValue(value: ForgeSelectValue): void;
    enable(): void;
    disable(): void;
    on(event: ForgeSelectEvent, handler: Handler): void;
    off(event: ForgeSelectEvent, handler: Handler): void;
    private buildDom;
    private bindEvents;
    private handleKeydown;
    private selectValue;
    private deselectValue;
    /**
     * Keeps every tree parent's own membership in `selected` consistent with
     * its descendants (post-order, so parents see already-corrected children):
     * a parent counts as selected only when `computeCheckState` says "all".
     * No-op for data with no `children` anywhere.
     */
    private syncTreeAncestors;
    private clearSelection;
    private afterSelectionChange;
    private syncNativeSelect;
    private findOption;
    private createFromQuery;
    private activateNavItem;
    private renderValue;
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
    private bindTagDrag;
    /** Alt+Left/Alt+Right on a focused tag: the keyboard-operable equivalent of dragging. */
    private handleTagKeydown;
    private focusTagByValue;
    private renderTemplate;
    private buildRows;
    private hasExactMatch;
    private usesVirtualScroll;
    private renderList;
    private renderRows;
    private renderRow;
    /**
     * Rendered row content is cached per option value and cloned on each render,
     * so templates run once per option instead of once per scroll frame.
     * State classes (selected/highlighted/disabled) live on the <li>, keeping the
     * cached content state-free.
     */
    private optionContent;
    private moveHighlight;
    private updateActiveDescendant;
    private scheduleRemoteLoad;
    /**
     * Fires on every list scroll. Only acts when pagination is opted into via
     * `ajax.pagination`; reads real scroll geometry rather than row counts so
     * it works whether or not virtual scrolling is active for this list.
     */
    private maybeLoadNextPage;
    private loadRemote;
}

export { type AjaxConfig, type DataItem, ForgeSelect, type ForgeSelectEvent, type ForgeSelectOptions, type ForgeSelectPlugin, type ForgeSelectValue, type Option, type OptionGroup, type TemplateFn, ForgeSelect as default };
