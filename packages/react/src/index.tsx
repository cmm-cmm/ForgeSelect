import { useEffect, useRef } from "react";
import ForgeSelect from "forge-select";
import type { ForgeSelectOptions, ForgeSelectValue } from "forge-select";

export interface ForgeSelectReactProps extends ForgeSelectOptions {
  /** Controlled value; synced into the instance via `.setValue()` on change. */
  value?: ForgeSelectValue;
  onChange?: (value: ForgeSelectValue) => void;
  className?: string;
}

/**
 * Mounts a real ForgeSelect instance once and keeps it alive for the
 * component's lifetime. ForgeSelect's own options (`data`, `templateResult`,
 * `plugins`, ...) are constructor-only and not reactive — to apply new
 * options, remount by changing this component's `key` prop. Only `value` is
 * kept in sync after mount.
 */
export function ForgeSelectReact(props: ForgeSelectReactProps) {
  const { value, onChange, className, ...options } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ForgeSelect | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const mountEl = document.createElement("select");
    container.appendChild(mountEl);
    const instance = new ForgeSelect(mountEl, options);
    instanceRef.current = instance;
    if (value !== undefined) instance.setValue(value);
    instance.on("change", (v) => onChangeRef.current?.(v as ForgeSelectValue));

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

  return <div ref={containerRef} className={className} />;
}

export default ForgeSelectReact;

export type {
  AjaxConfig,
  DataItem,
  ForgeSelectEvent,
  ForgeSelectOptions,
  ForgeSelectPlugin,
  ForgeSelectValue,
  Option,
  OptionGroup,
  SetValueOptions,
  TemplateFn,
} from "forge-select";
