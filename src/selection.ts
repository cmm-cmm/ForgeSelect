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

/**
 * The current selection, as either the ordered array or a set built from it.
 * Check state is decided by membership alone, and a caller resolving many
 * nodes against one large selection wants that membership to be O(1); one
 * resolving a single node has no reason to build a set for it.
 */
export type Selection = readonly string[] | ReadonlySet<string>;

const memberTest = (selected: Selection): ((value: string) => boolean) =>
  selected instanceof Set ? (value) => selected.has(value) : (value) => (selected as readonly string[]).includes(value);

function checkState(option: Option, has: (value: string) => boolean, isDisabled: IsDisabled): "none" | "some" | "all" {
  if (!option.children?.length) return has(option.value) ? "all" : "none";
  const states = option.children
    .filter((child) => !isDisabled(child))
    .map((child) => checkState(child, has, isDisabled));
  if (states.length === 0) return "none";
  if (states.every((state) => state === "all")) return "all";
  if (states.every((state) => state === "none")) return "none";
  return "some";
}

export function computeCheckState(
  option: Option,
  selected: Selection,
  isDisabled: IsDisabled = defaultIsDisabled,
): "none" | "some" | "all" {
  return checkState(option, memberTest(selected), isDisabled);
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
  // One set for the whole walk. Every node's state is decided by testing each
  // of its descendants against the selection, and the walk visits every node,
  // so scanning the array per test made syncing a large tree selection
  // quadratic in it. The set mirrors the array's push and splice below purely
  // so the two cannot drift: only leaves are tested, and a node is visited
  // once, so nothing in a walk currently reads a parent's own membership after
  // it changes. Keeping them in step is what makes that stay true if the
  // traversal or the state rule ever changes.
  const present = new Set(selected);
  const has = (value: string): boolean => present.has(value);
  const sync = (option: Option): void => {
    if (!option.children?.length) return;
    for (const child of option.children) sync(child);
    const state = checkState(option, has, isDisabled);
    if (state === "all") {
      if (present.has(option.value)) return;
      selected.push(option.value);
      present.add(option.value);
      return;
    }
    if (!present.has(option.value)) return;
    selected.splice(selected.indexOf(option.value), 1);
    present.delete(option.value);
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
