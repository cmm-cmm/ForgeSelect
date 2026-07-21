import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import ForgeSelectVue from "../src/index";

function mountOnBody(
  component: ReturnType<typeof defineComponent> | typeof ForgeSelectVue,
  props: Record<string, unknown>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createApp({ render: () => h(component, props) });
  app.mount(container);
  return { container, app };
}

describe("ForgeSelectVue", () => {
  it("synchronizes runtime options and controlled open/search state", async () => {
    const options = ref({ placeholder: "Before", theme: "default", data: [{ value: "dn", label: "Đà Nẵng" }] });
    const open = ref(false);
    const query = ref("");
    const Wrapper = defineComponent({
      setup() {
        return () => h(ForgeSelectVue, { options: options.value, open: open.value, searchQuery: query.value });
      },
    });
    const { container } = mountOnBody(Wrapper, {});
    options.value = { ...options.value, placeholder: "After", theme: "dark" };
    open.value = true;
    query.value = "da";
    await nextTick();
    expect(container.querySelector(".forge-select__placeholder")?.textContent).toBe("After");
    expect(container.querySelector<HTMLElement>(".forge-select")?.dataset.theme).toBe("dark");
    expect(container.querySelector<HTMLElement>(".forge-select__dropdown")?.hidden).toBe(false);
    expect(container.querySelector<HTMLInputElement>(".forge-select__search")?.value).toBe("da");
  });

  it("mounts with default options", () => {
    const { container } = mountOnBody(ForgeSelectVue, {});
    expect(container.querySelector(".forge-select")).not.toBeNull();
  });

  it("mounts a ForgeSelect instance inside the container", () => {
    const { container } = mountOnBody(ForgeSelectVue, {
      options: { placeholder: "Pick one", data: [{ value: "a", label: "A" }] },
    });
    expect(container.querySelector(".forge-select")).not.toBeNull();
    expect(container.querySelector(".forge-select__placeholder")?.textContent).toBe("Pick one");
  });

  it("emits update:modelValue and change when a value is selected", () => {
    let emittedModel: unknown;
    let emittedChange: unknown;
    const { container } = mountOnBody(ForgeSelectVue, {
      options: {
        data: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
      "onUpdate:modelValue": (v: unknown) => {
        emittedModel = v;
      },
      onChange: (v: unknown) => {
        emittedChange = v;
      },
    });

    container.querySelector<HTMLElement>(".forge-select__control")!.click();
    container.querySelectorAll<HTMLElement>(".forge-select__option")[1].click();

    expect(emittedModel).toBe("b");
    expect(emittedChange).toBe("b");
  });

  it("syncs modelValue after mount", async () => {
    const data = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ];
    const modelValue = ref("a");
    const Wrapper = defineComponent({
      setup() {
        return () => h(ForgeSelectVue, { options: { data }, modelValue: modelValue.value });
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    createApp(Wrapper).mount(container);

    expect(container.querySelector(".forge-select__single-value")?.textContent).toBe("A");

    modelValue.value = "b";
    await nextTick();
    expect(container.querySelector(".forge-select__single-value")?.textContent).toBe("B");
  });

  it("updates rendered options when options.data changes", async () => {
    const data = ref([{ value: "a", label: "A" }]);
    const Wrapper = defineComponent({
      setup() {
        return () => h(ForgeSelectVue, { options: { data: data.value } });
      },
    });
    const { container } = mountOnBody(Wrapper, {});
    container.querySelector<HTMLElement>(".forge-select__control")!.click();
    expect(container.querySelectorAll(".forge-select__option")).toHaveLength(1);
    data.value = [
      { value: "b", label: "B" },
      { value: "c", label: "C" },
    ];
    await nextTick();
    expect(container.querySelectorAll(".forge-select__option")).toHaveLength(2);
  });

  it("forwards detailed selection events", () => {
    const onSelect = vi.fn();
    const { container } = mountOnBody(ForgeSelectVue, {
      options: { data: [{ value: "a", label: "A" }] },
      onSelect,
    });
    container.querySelector<HTMLElement>(".forge-select__control")!.click();
    container.querySelector<HTMLElement>(".forge-select__option")!.click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: "a" }));
  });

  it("forwards unselect when a tag is removed", () => {
    const onUnselect = vi.fn();
    const { container } = mountOnBody(ForgeSelectVue, {
      options: { multiple: true, data: [{ value: "a", label: "A" }] },
      modelValue: ["a"],
      onUnselect,
    });
    container.querySelector<HTMLElement>(".forge-select__tag-remove")!.click();
    expect(onUnselect).toHaveBeenCalledWith(expect.objectContaining({ value: "a" }));
  });

  it("forwards create when a new tag is created via allowCreate", () => {
    const onCreate = vi.fn();
    const { container } = mountOnBody(ForgeSelectVue, {
      options: { multiple: true, allowCreate: true },
      onCreate,
    });
    container.querySelector<HTMLElement>(".forge-select__control")!.click();
    const input = container.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "Wakanda";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    container.querySelector<HTMLElement>(".forge-select__option--create")!.click();
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ value: "Wakanda" }));
  });

  it("forwards reorder when a focused tag is moved via Alt+ArrowRight", () => {
    const onReorder = vi.fn();
    const { container } = mountOnBody(ForgeSelectVue, {
      options: {
        multiple: true,
        sortable: true,
        data: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
      modelValue: ["a", "b"],
      onReorder,
    });
    const tag = container.querySelector<HTMLElement>(".forge-select__tag")!;
    tag.focus();
    tag.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }));
    expect(onReorder).toHaveBeenCalledWith(["b", "a"]);
  });

  it("forwards maximum when a pick is rejected by maxSelections", () => {
    const onMaximum = vi.fn();
    const { container } = mountOnBody(ForgeSelectVue, {
      options: {
        multiple: true,
        maxSelections: 1,
        data: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
      modelValue: ["a"],
      onMaximum,
    });
    container.querySelector<HTMLElement>(".forge-select__control")!.click();
    const rejected = Array.from(container.querySelectorAll<HTMLElement>(".forge-select__option")).find(
      (li) => li.textContent === "B",
    )!;
    rejected.click();
    expect(onMaximum).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
  });

  it("forwards invalid when the underlying required select fails validation", () => {
    const onInvalid = vi.fn();
    const { container } = mountOnBody(ForgeSelectVue, {
      options: { required: true },
      onInvalid,
    });
    const nativeSelect = container.querySelector<HTMLSelectElement>("select")!;
    nativeSelect.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(onInvalid).toHaveBeenCalledWith(expect.any(String));
  });

  it("forwards error and loading for a failed ajax request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const onError = vi.fn();
    const onLoading = vi.fn();
    const { container } = mountOnBody(ForgeSelectVue, {
      options: { ajax: { url: "/api", debounce: 0 } },
      onError,
      onLoading,
    });
    container.querySelector<HTMLElement>(".forge-select__control")!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onLoading).toHaveBeenCalledWith(true);
    expect(onLoading).toHaveBeenCalledWith(false);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    vi.unstubAllGlobals();
  });

  it("closes via a reactive open prop transitioning back to false", async () => {
    const open = ref(true);
    const Wrapper = defineComponent({
      setup() {
        return () => h(ForgeSelectVue, { options: { data: [{ value: "a", label: "A" }] }, open: open.value });
      },
    });
    const { container } = mountOnBody(Wrapper, {});
    expect(container.querySelector<HTMLElement>(".forge-select__dropdown")?.hidden).toBe(false);
    open.value = false;
    await nextTick();
    expect(container.querySelector<HTMLElement>(".forge-select__dropdown")?.hidden).toBe(true);
  });

  it("ignores a modelValue change to undefined instead of clearing the selection", async () => {
    const modelValue = ref<string | undefined>("a");
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(ForgeSelectVue, {
            options: {
              data: [
                { value: "a", label: "A" },
                { value: "b", label: "B" },
              ],
            },
            modelValue: modelValue.value,
          });
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    createApp(Wrapper).mount(container);
    expect(container.querySelector(".forge-select__single-value")?.textContent).toBe("A");

    modelValue.value = undefined;
    await nextTick();
    expect(container.querySelector(".forge-select__single-value")?.textContent).toBe("A");
  });

  it("does not emit changes while synchronizing modelValue", async () => {
    const modelValue = ref("a");
    const onUpdate = vi.fn();
    const onChange = vi.fn();
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(ForgeSelectVue, {
            options: {
              data: [
                { value: "a", label: "A" },
                { value: "b", label: "B" },
              ],
            },
            modelValue: modelValue.value,
            "onUpdate:modelValue": onUpdate,
            onChange,
          });
      },
    });
    mountOnBody(Wrapper, {});
    modelValue.value = "b";
    await nextTick();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits open, close, search, and clear", () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onSearch = vi.fn();
    const onClear = vi.fn();
    const { container } = mountOnBody(ForgeSelectVue, {
      options: { clearable: true, data: [{ value: "a", label: "A" }] },
      modelValue: "a",
      onOpen,
      onClose,
      onSearch,
      onClear,
    });

    container.querySelector<HTMLElement>(".forge-select__control")!.click();
    expect(onOpen).toHaveBeenCalledTimes(1);

    const input = container.querySelector<HTMLInputElement>(".forge-select__search")!;
    input.value = "x";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onSearch).toHaveBeenCalledWith("x");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    container.querySelector<HTMLElement>(".forge-select__clear")!.click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("destroys the instance on unmount", () => {
    const { container, app } = mountOnBody(ForgeSelectVue, {
      options: { data: [{ value: "a", label: "A" }] },
    });
    expect(container.querySelector(".forge-select")).not.toBeNull();

    app.unmount();
    expect(container.querySelector(".forge-select")).toBeNull();
  });
});
