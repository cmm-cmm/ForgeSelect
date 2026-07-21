import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue";
import ForgeSelect from "forge-select";
import type { ForgeSelectOptions, ForgeSelectValue } from "forge-select";

/**
 * Mounts a real ForgeSelect instance once and keeps it alive for the
 * component's lifetime. Runtime-updateable options stay synchronized;
 * structural mode/plugin/portal changes require a remount.
 */
export const ForgeSelectVue = defineComponent({
  name: "ForgeSelectVue",
  props: {
    options: {
      type: Object as PropType<ForgeSelectOptions>,
      default: () => ({}),
    },
    modelValue: {
      type: [String, Array] as PropType<ForgeSelectValue>,
      default: undefined,
    },
    open: {
      type: Boolean as PropType<boolean | undefined>,
      default: undefined,
    },
    searchQuery: {
      type: String,
      default: undefined,
    },
  },
  emits: [
    "update:modelValue",
    "change",
    "open",
    "close",
    "search",
    "clear",
    "error",
    "select",
    "unselect",
    "create",
    "reorder",
    "maximum",
    "update:open",
    "update:searchQuery",
    "loading",
    "invalid",
  ],
  setup(props, { emit, expose }) {
    const containerRef = ref<HTMLDivElement | null>(null);
    let instance: ForgeSelect | null = null;

    // Escape hatch to the underlying ForgeSelect instance (e.g. for
    // `.selectAll()`/`.reload()` called imperatively via a template ref),
    // forwarding lazily so it stays correct across the instance's full
    // lifecycle without needing to keep a method list in sync. Vue's own
    // exposeProxy gates access with a `key in target` check before it will
    // even call `get`, so a `has` trap forwarding to the live instance is
    // required, not just `get`.
    expose(
      new Proxy({} as ForgeSelect, {
        get(_target, prop) {
          const value = instance ? Reflect.get(instance, prop, instance) : undefined;
          return typeof value === "function" ? value.bind(instance) : value;
        },
        has(_target, prop) {
          return instance ? Reflect.has(instance, prop) : false;
        },
      }),
    );

    onMounted(() => {
      if (!containerRef.value) return;
      const mountEl = document.createElement("select");
      containerRef.value.appendChild(mountEl);
      instance = new ForgeSelect(mountEl, props.options);
      if (props.modelValue !== undefined) instance.setValue(props.modelValue);
      if (props.searchQuery !== undefined) instance.setSearchQuery(props.searchQuery, { emitSearch: false });
      if (props.open) instance.open();
      instance.on("change", (value) => {
        emit("update:modelValue", value as ForgeSelectValue);
        emit("change", value as ForgeSelectValue);
      });
      instance.on("open", () => {
        emit("open");
        emit("update:open", true);
      });
      instance.on("close", () => {
        emit("close");
        emit("update:open", false);
      });
      instance.on("search", (query) => {
        emit("search", query as string);
        emit("update:searchQuery", query as string);
      });
      instance.on("clear", () => emit("clear"));
      instance.on("error", (error) => emit("error", error as Error));
      instance.on("select", (option) => emit("select", option));
      instance.on("unselect", (option) => emit("unselect", option));
      instance.on("create", (option) => emit("create", option));
      instance.on("reorder", (value) => emit("reorder", value));
      instance.on("maximum", (event) => emit("maximum", event));
      instance.on("loading", (loading) => emit("loading", loading));
      instance.on("invalid", (message) => emit("invalid", message));
    });

    onBeforeUnmount(() => {
      instance?.destroy();
      instance = null;
    });

    watch(
      () => props.modelValue,
      (value) => {
        if (instance && value !== undefined) instance.setValue(value, { emitChange: false });
      },
    );

    watch(
      () => props.options,
      (options) => {
        if (!instance) return;
        const { multiple, searchable, plugins, dropdownParent, ...updateable } = options;
        void multiple;
        void searchable;
        void plugins;
        void dropdownParent;
        instance.updateOptions(updateable);
      },
      { deep: true },
    );

    watch(
      () => props.open,
      (open) => {
        if (!instance || open === undefined) return;
        if (open) instance.open();
        else instance.close();
      },
    );

    watch(
      () => props.searchQuery,
      (query) => {
        if (instance && query !== undefined) instance.setSearchQuery(query, { emitSearch: false });
      },
    );

    return () => h("div", { ref: containerRef });
  },
});

export default ForgeSelectVue;

export type {
  AjaxConfig,
  DataItem,
  ForgeSelectEvent,
  ForgeSelectEventHandler,
  ForgeSelectEventMap,
  ForgeSelectOptions,
  ForgeSelectUpdateOptions,
  ForgeSelectPlugin,
  ForgeSelectValue,
  MaximumSelectionEvent,
  Option,
  OptionGroup,
  SetValueOptions,
  SetSearchQueryOptions,
  SearchField,
  SearchScorer,
  TemplateFn,
} from "forge-select";
