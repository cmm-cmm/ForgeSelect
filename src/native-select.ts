import type { DataItem, Option } from "./types";

export function parseNativeOptions(select: HTMLSelectElement): DataItem[] {
  const data: DataItem[] = [];
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      data.push({ label: child.label, options: Array.from(child.querySelectorAll("option")).map(parseOption) });
    } else if (child instanceof HTMLOptionElement) {
      data.push(parseOption(child));
    }
  }
  return data;
}

function parseOption(option: HTMLOptionElement): Option {
  const groupDisabled = option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled;
  return {
    value: option.value,
    label: option.textContent?.trim() ?? option.value,
    disabled: option.disabled || groupDisabled || undefined,
  };
}
