import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import ForgeSelectVue from "../src/index";

function mountOnBody(component: ReturnType<typeof defineComponent> | typeof ForgeSelectVue, props: Record<string, unknown>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createApp({ render: () => h(component, props) });
  app.mount(container);
  return { container, app };
}

describe("ForgeSelectVue", () => {
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

  it("destroys the instance on unmount", () => {
    const { container, app } = mountOnBody(ForgeSelectVue, {
      options: { data: [{ value: "a", label: "A" }] },
    });
    expect(container.querySelector(".forge-select")).not.toBeNull();

    app.unmount();
    expect(container.querySelector(".forge-select")).toBeNull();
  });
});
