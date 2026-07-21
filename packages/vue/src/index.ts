import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue";
import ForgeSelect from "forge-select";
import type { ForgeSelectOptions, ForgeSelectValue } from "forge-select";

/**
 * Mounts a real ForgeSelect instance once and keeps it alive for the
 * component's lifetime. `modelValue` and `options.data` stay synchronized;
 * templates, plugins, and other constructor options require a remount.
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
  ],
  setup(props, { emit }) {
    const containerRef = ref<HTMLDivElement | null>(null);
    let instance: ForgeSelect | null = null;

    onMounted(() => {
      if (!containerRef.value) return;
      const mountEl = document.createElement("select");
      containerRef.value.appendChild(mountEl);
      instance = new ForgeSelect(mountEl, props.options);
      if (props.modelValue !== undefined) instance.setValue(props.modelValue);
      instance.on("change", (value) => {
        emit("update:modelValue", value as ForgeSelectValue);
        emit("change", value as ForgeSelectValue);
      });
      instance.on("open", () => emit("open"));
      instance.on("close", () => emit("close"));
      instance.on("search", (query) => emit("search", query as string));
      instance.on("clear", () => emit("clear"));
      instance.on("error", (error) => emit("error", error as Error));
      instance.on("select", (option) => emit("select", option));
      instance.on("unselect", (option) => emit("unselect", option));
      instance.on("create", (option) => emit("create", option));
      instance.on("reorder", (value) => emit("reorder", value));
      instance.on("maximum", (event) => emit("maximum", event));
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
      () => props.options.data,
      (data) => {
        if (instance && data !== undefined) instance.setData(data);
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
  ForgeSelectPlugin,
  ForgeSelectValue,
  MaximumSelectionEvent,
  Option,
  OptionGroup,
  SetValueOptions,
  TemplateFn,
} from "forge-select";
