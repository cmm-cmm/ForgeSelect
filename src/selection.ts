import type { DataItem, Option, OptionGroup } from "./types";

export function isGroup(item: DataItem): item is OptionGroup {
  return (item as OptionGroup).options !== undefined;
}

export type IsDisabled = (option: Option) => boolean;
const defaultIsDisabled: IsDisabled = (option) => !!option.disabled;

// Disabled descendants are excluded from `navItems` (see buildRows in
// ForgeSelect.ts) and so can never be toggled back off by the user through
// the UI — cascading a parent's (de)selection onto them would strand them
// permanently selected. Their own children remain independently selectable
// (only the disabled node itself is skipped), matching buildRows' rendering.
// `isDisabled` defaults to the static `option.disabled` check so callers that
// don't pass one keep today's exact behavior; ForgeSelect.ts passes a
// predicate that also folds in the dynamic `isOptionDisabled` callback.
export function collectDescendantValues(option: Option, isDisabled: IsDisabled = defaultIsDisabled): string[] {
  if (!option.children) return [];
  const values: string[] = [];
  for (const child of option.children) {
    if (!isDisabled(child)) values.push(child.value);
    values.push(...collectDescendantValues(child, isDisabled));
  }
  return values;
}

export function computeCheckState(
  option: Option,
  selected: string[],
  isDisabled: IsDisabled = defaultIsDisabled,
): "none" | "some" | "all" {
  if (!option.children?.length) return selected.includes(option.value) ? "all" : "none";
  const states = option.children
    .filter((child) => !isDisabled(child))
    .map((child) => computeCheckState(child, selected, isDisabled));
  if (states.length === 0) return "none";
  if (states.every((state) => state === "all")) return "all";
  if (states.every((state) => state === "none")) return "none";
  return "some";
}

export function findOption(items: DataItem[], value: string): Option | undefined {
  const search = (options: Option[]): Option | undefined => {
    for (const option of options) {
      if (option.value === value) return option;
      const found = option.children ? search(option.children) : undefined;
      if (found) return found;
    }
    return undefined;
  };
  for (const item of items) {
    const found = search(isGroup(item) ? item.options : [item]);
    if (found) return found;
  }
  return undefined;
}

export function syncTreeAncestors(
  items: DataItem[],
  selected: string[],
  isDisabled: IsDisabled = defaultIsDisabled,
): void {
  const sync = (option: Option): void => {
    if (!option.children?.length) return;
    for (const child of option.children) sync(child);
    const state = computeCheckState(option, selected, isDisabled);
    const index = selected.indexOf(option.value);
    if (state === "all" && index === -1) selected.push(option.value);
    else if (state !== "all" && index !== -1) selected.splice(index, 1);
  };
  for (const item of items) (isGroup(item) ? item.options : [item]).forEach(sync);
}

export function collectValues(items: DataItem[]): Set<string> {
  const values = new Set<string>();
  const visit = (option: Option): void => {
    values.add(option.value);
    option.children?.forEach(visit);
  };
  for (const item of items) (isGroup(item) ? item.options : [item]).forEach(visit);
  return values;
}

export function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
