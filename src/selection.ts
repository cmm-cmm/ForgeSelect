import type { DataItem, Option, OptionGroup } from "./types";

export function isGroup(item: DataItem): item is OptionGroup {
  return (item as OptionGroup).options !== undefined;
}

export function collectDescendantValues(option: Option): string[] {
  if (!option.children) return [];
  const values: string[] = [];
  for (const child of option.children) values.push(child.value, ...collectDescendantValues(child));
  return values;
}

export function computeCheckState(option: Option, selected: string[]): "none" | "some" | "all" {
  if (!option.children?.length) return selected.includes(option.value) ? "all" : "none";
  const states = option.children.map((child) => computeCheckState(child, selected));
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

export function syncTreeAncestors(items: DataItem[], selected: string[]): void {
  const sync = (option: Option): void => {
    if (!option.children?.length) return;
    for (const child of option.children) sync(child);
    const state = computeCheckState(option, selected);
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
