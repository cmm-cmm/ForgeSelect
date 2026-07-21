import { useEffect, useRef } from "react";
import ForgeSelect from "forge-select";
import type { ForgeSelectOptions, ForgeSelectValue, MaximumSelectionEvent, Option } from "forge-select";

export interface ForgeSelectReactProps extends ForgeSelectOptions {
  /** Controlled value; synced into the instance via `.setValue()` on change. */
  value?: ForgeSelectValue;
  onChange?: (value: ForgeSelectValue) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onSearch?: (query: string) => void;
  onClear?: () => void;
  onError?: (error: Error) => void;
  onSelect?: (option: Option) => void;
  onUnselect?: (option: Option) => void;
  onCreate?: (option: Option) => void;
  onReorder?: (value: string[]) => void;
  onMaximum?: (event: MaximumSelectionEvent) => void;
  className?: string;
}

/**
 * Mounts a real ForgeSelect instance once and keeps it alive for the
 * component's lifetime. `value` and `data` stay synchronized after mount;
 * templates, plugins, and other constructor options require a remount.
 */
export function ForgeSelectReact(props: ForgeSelectReactProps) {
  const {
    value,
    data,
    onChange,
    onOpen,
    onClose,
    onSearch,
    onClear,
    onError,
    onSelect,
    onUnselect,
    onCreate,
    onReorder,
    onMaximum,
    className,
    ...options
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ForgeSelect | null>(null);
  const onChangeRef = useRef(onChange);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onSearchRef = useRef(onSearch);
  const onClearRef = useRef(onClear);
  const onErrorRef = useRef(onError);
  const onSelectRef = useRef(onSelect);
  const onUnselectRef = useRef(onUnselect);
  const onCreateRef = useRef(onCreate);
  const onReorderRef = useRef(onReorder);
  const onMaximumRef = useRef(onMaximum);

  useEffect(() => {
    onChangeRef.current = onChange;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    onSearchRef.current = onSearch;
    onClearRef.current = onClear;
    onErrorRef.current = onError;
    onSelectRef.current = onSelect;
    onUnselectRef.current = onUnselect;
    onCreateRef.current = onCreate;
    onReorderRef.current = onReorder;
    onMaximumRef.current = onMaximum;
  }, [onChange, onOpen, onClose, onSearch, onClear, onError, onSelect, onUnselect, onCreate, onReorder, onMaximum]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const mountEl = document.createElement("select");
    container.appendChild(mountEl);
    const instance = new ForgeSelect(mountEl, { ...options, data });
    instanceRef.current = instance;
    if (value !== undefined) instance.setValue(value);
    instance.on("change", (v) => onChangeRef.current?.(v as ForgeSelectValue));
    instance.on("open", () => onOpenRef.current?.());
    instance.on("close", () => onCloseRef.current?.());
    instance.on("search", (q) => onSearchRef.current?.(q as string));
    instance.on("clear", () => onClearRef.current?.());
    instance.on("error", (e) => onErrorRef.current?.(e as Error));
    instance.on("select", (option) => onSelectRef.current?.(option));
    instance.on("unselect", (option) => onUnselectRef.current?.(option));
    instance.on("create", (option) => onCreateRef.current?.(option));
    instance.on("reorder", (next) => onReorderRef.current?.(next));
    instance.on("maximum", (event) => onMaximumRef.current?.(event));

    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
    // Mounted once — see the class doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (instanceRef.current && value !== undefined) {
      instanceRef.current.setValue(value, { emitChange: false });
    }
  }, [value]);

  useEffect(() => {
    if (instanceRef.current && data !== undefined) instanceRef.current.setData(data);
  }, [data]);

  return <div ref={containerRef} className={className} />;
}

export default ForgeSelectReact;

export type {
  AjaxConfig,
  DataItem,
  ForgeSelectEvent,
  ForgeSelectEventHandler,
  ForgeSelectEventMap,
  ForgeSelectOptions,
  ForgeSelectPlugin,
  ForgeSelectValue,
  MaximumSelectionEvent,
  Option,
  OptionGroup,
  SetValueOptions,
  TemplateFn,
} from "forge-select";
