import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue";
import ForgeSelect from "forge-select";
import type { ForgeSelectOptions, ForgeSelectValue } from "forge-select";

/**
 * Mounts a real ForgeSelect instance once and keeps it alive for the
 * component's lifetime. ForgeSelect's own options (`data`, `templateResult`,
 * `plugins`, ...) are constructor-only and not reactive — to apply new
 * options, force a remount with a different `:key`. Only `modelValue` is
 * kept in sync after mount, following Vue 3's `v-model` convention.
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
  emits: ["update:modelValue", "change"],
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

    return () => h("div", { ref: containerRef });
  },
});

export default ForgeSelectVue;

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
