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
}
interface OptionGroup {
    label: string;
    options: Option[];
}
type DataItem = Option | OptionGroup;
interface AjaxConfig {
    url: string | ((query: string) => string);
    params?: (query: string) => Record<string, unknown>;
    /** Debounce in milliseconds. Default 250. */
    debounce?: number;
    transform?: (response: unknown) => Option[];
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
    private loading;
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
    private clearSelection;
    private afterSelectionChange;
    private syncNativeSelect;
    private findOption;
    private createFromQuery;
    private activateNavItem;
    private renderValue;
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
    private loadRemote;
}

export { type AjaxConfig, type DataItem, ForgeSelect, type ForgeSelectEvent, type ForgeSelectOptions, type ForgeSelectPlugin, type ForgeSelectValue, type Option, type OptionGroup, type TemplateFn, ForgeSelect as default };
