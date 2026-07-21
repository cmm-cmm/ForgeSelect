# API Reference

> [Docs home](./README.md)

## Constructor

```js
import ForgeSelect from "forge-select";

const select = new ForgeSelect(target, options);
```

- `target` — a CSS selector string, or an `HTMLSelectElement`/`HTMLElement`.
- `options` — an options object (see below). All options are optional.

## Options

| Option                | Type                               | Default     | Description                                                                                                                               |
| --------------------- | ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `placeholder`         | `string`                           | `""`        | Text shown when nothing is selected.                                                                                                      |
| `searchable`          | `boolean`                          | `true`      | Show a search input inside the dropdown.                                                                                                  |
| `multiple`            | `boolean`                          | `false`     | Allow selecting more than one option.                                                                                                     |
| `clearable`           | `boolean`                          | `false`     | Show a button to clear the current selection.                                                                                             |
| `allowCreate`         | `boolean`                          | `false`     | Let the user create a new option from free text (tags mode).                                                                              |
| `sortable`            | `boolean`                          | `false`     | Multi-select only: let the user reorder selected tags by dragging (mouse/touch/pen), or with `Alt+Left`/`Alt+Right` when a tag has focus. |
| `closeOnSelect`       | `boolean`                          | `false`     | Multi-select only: close the dropdown immediately after each pick instead of staying open.                                                |
| `maxSelections`       | `number`                           | `undefined` | Multi-select only: caps the number of selected values; further picks (including `allowCreate`) are ignored once reached.                  |
| `theme`               | `string`                           | `"default"` | Named theme applied via a `data-theme` attribute / CSS class.                                                                             |
| `disabled`            | `boolean`                          | `false`     | Render the control as disabled.                                                                                                           |
| `required`            | `boolean`                          | `false`     | Marks the field as required. On a native `<select>` mount, blocks form submission and shows invalid styling until a value is picked.      |
| `data`                | `Array<Option \| OptionGroup>`     | `undefined` | Static options, used instead of `<option>` children.                                                                                      |
| `ajax`                | `AjaxConfig`                       | `undefined` | Remote data source config (`url`, `params`, `debounce`, `pagination`, `transform`).                                                       |
| `templateResult`      | `(option) => string \| Node`       | `undefined` | Custom renderer for dropdown list items.                                                                                                  |
| `templateSelection`   | `(option) => string \| Node`       | `undefined` | Custom renderer for the selected value display.                                                                                           |
| `filterOption`        | `(option, query) => boolean`       | `undefined` | Custom match predicate, replacing the built-in label/description substring match.                                                         |
| `minSearchLength`     | `number`                           | `0`         | Hides results (with a hint row) until the trimmed query reaches this length; also delays ajax requests until then.                        |
| `minResultsForSearch` | `number`                           | `0`         | Hides the local-list search field when fewer options exist; AJAX search remains visible.                                                  |
| `isOptionDisabled`    | `(option) => boolean`              | `undefined` | Dynamically disables an option in addition to its static `disabled` field. Re-evaluated on every render.                                  |
| `virtualScroll`       | `boolean`                          | _(auto)_    | `true`/unset = virtualize once the list exceeds ~100 rows; `false` = never virtualize.                                                    |
| `itemHeight`          | `number`                           | `36`        | Row height in px used by the virtual scroller. Raise it (e.g. `52`) for rich items with avatars/descriptions.                             |
| `language`            | `string \| Record<string, string>` | `"en"`      | Locale code or a custom string table for i18n.                                                                                            |
| `plugins`             | `Array<ForgeSelectPlugin>`         | `[]`        | Plugins to register on this instance. See the [Plugin Development Guide](./plugin-development.md).                                        |
| `openOnFocus`         | `boolean`                          | `false`     | Opens the dropdown when the control receives keyboard focus (e.g. via Tab).                                                               |
| `dropdownParent`      | `HTMLElement \| string`            | `undefined` | Portals the dropdown into a container (commonly `document.body`) to escape overflow-hidden ancestors.                                     |

### `Option` shape

```ts
interface Option {
  value: string;
  label: string;
  disabled?: boolean;
  avatar?: string; // image URL/data URI, shown as a round avatar
  description?: string; // secondary line under the label
  meta?: Record<string, unknown>; // arbitrary payload for custom templates
  className?: string; // extra CSS class(es) applied to this option's <li>
  children?: Option[]; // nested options — makes this a tree node
}

interface OptionGroup {
  label: string;
  options: Option[];
}
```

### Tree select (nested options)

Add `children` to any `Option` to turn it into an expandable/collapsible tree node — purely additive, so a list where no option has `children` renders and behaves exactly like a flat list:

```js
new ForgeSelect("#categories", {
  data: [
    {
      value: "fruits",
      label: "Fruits",
      children: [
        { value: "apple", label: "Apple" },
        { value: "banana", label: "Banana" },
      ],
    },
  ],
});
```

Nodes with children start collapsed and show a twisty (▶/▼) to expand/collapse; searching shows a node if it or any descendant matches, temporarily auto-expanding matching branches without disturbing manually-expanded state. In `multiple: true` mode, selecting a parent selects/deselects all of its descendants, and a parent whose descendants are only partially selected gets the `forge-select__option--indeterminate` class.

### Sortable tags (drag & drop ordering)

With `multiple: true, sortable: true`, selected tags can be reordered by dragging (mouse/touch/pen, via Pointer Events) or with `Alt+Left`/`Alt+Right` when a tag has keyboard focus — both paths funnel through the same `change` event, so `getValue()` always reflects the current tag order. If mounted on a native `<select multiple>`, the underlying `<option>` elements are also reordered to match, so a plain `<form>` submission serializes values in the dragged order. Purely opt-in — multi-select behavior is unchanged when `sortable` is left at its default `false`.

### Dropdown positioning

The dropdown renders below the control by default. If there isn't enough room below but there is above (e.g. the control is near the bottom of the viewport), it automatically flips above instead — recomputed on `open()` and on window resize, with no configuration needed.

For modals, drawers, or containers that clip descendants, set `dropdownParent: document.body` (or a selector/element). The portalled dropdown follows the control on resize and ancestor scrolling, retains the selected theme, and is removed by `.destroy()`.

### Native form validation (`required`)

When mounted on a real `<select>`, `required: true` participates in the browser's Constraint Validation API exactly like a native `<select required>`: an empty selection blocks `<form>` submission, and Forge Select shows its own inline invalid styling (`forge-select__control--invalid`, `aria-invalid`) and opens the dropdown in response to the native `invalid` event, since the hidden native element can't display its own validation bubble. The styling clears as soon as a valid selection is made. On a plain-element mount (no native `<select>` to hook into), `required: true` only sets `aria-required` for assistive tech — there's no native form to participate in.

### Dynamic option disabling (`isOptionDisabled`)

`isOptionDisabled` is re-evaluated on every render, so an option can be disabled based on external state (e.g. a quota) without rebuilding `data` via `setData()`:

```js
new ForgeSelect("#seats", {
  multiple: true,
  maxSelections: 4,
  isOptionDisabled: (option) => option.meta?.soldOut === true,
});
```

It combines with (does not replace) an option's static `disabled` field, and is honored everywhere `disabled` already is: row styling, keyboard navigation, and tree cascade selection.

### Rich items

When an option has `avatar` and/or `description` and no custom template is set, Forge Select renders them with a built-in layout (avatar + label + description in the dropdown; small avatar + label in the selected value/tags). All built-in fields are inserted via `textContent`, so they are **XSS-safe** — no escaping needed on your side. `description` is also matched by the search filter.

Custom templates (`templateResult`/`templateSelection`) receive the full option including `meta`. A **string** return value is injected as raw HTML — sanitize any user-provided data yourself. Rendered row content is cached per option value and cloned on scroll, so templates run once per option regardless of scrolling; if your template returns a DOM **Node**, don't rely on event listeners attached inside it (clones don't carry listeners — use event delegation on the document instead).

### `AjaxConfig` shape

```ts
interface AjaxConfig {
  url?: string | ((query: string, page: number) => string);
  request?: (query: string, page: number, signal: AbortSignal) => Promise<unknown>;
  params?: (query: string, page: number) => Record<string, unknown>;
  debounce?: number; // ms, default 250
  pagination?: boolean; // opt in to loading further pages on scroll; default false
  transform?: (response: unknown) => Option[] | { options: Option[]; hasMore: boolean };
}
```

Provide either `url` for the built-in GET transport or `request` for POST, authenticated, GraphQL, or custom-client requests. `request` takes precedence and its result is passed through the same `transform` function; respect the supplied `AbortSignal` where the underlying client supports cancellation.

By default `ajax` replaces the whole list on every search (`transform` returns a plain `Option[]`, as above). Set `pagination: true` to additionally load more pages as the user scrolls near the bottom of the dropdown: `params` now also receives the current `page` (starting at `0`), and `transform` should return `{ options, hasMore }` so Forge Select knows whether to keep requesting further pages. A search query change always resets back to page `0` and replaces the list, regardless of `pagination`. See [Examples](./examples.md) for a full snippet.

## Instance methods

| Method                       | Returns                      | Description                                                                                                                              |
| ---------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `.open()`                    | `void`                       | Opens the dropdown.                                                                                                                      |
| `.close()`                   | `void`                       | Closes the dropdown.                                                                                                                     |
| `.destroy()`                 | `void`                       | Removes Forge Select and restores the original element.                                                                                  |
| `.getValue()`                | `string \| string[] \| null` | Returns the current value(s).                                                                                                            |
| `.setValue(value, options?)` | `void`                       | Sets the value; `{ emitChange: false }` synchronizes silently.                                                                           |
| `.setData(data)`             | `void`                       | Replaces the option list, cancels pending AJAX/pagination work, re-renders an open dropdown, and preserves existing selections.          |
| `.selectAll()`               | `void`                       | Multi-select only: selects every non-disabled option (including tree descendants and grouped options), capped by `maxSelections` if set. |
| `.clearAll()`                | `void`                       | Clears every selection. Equivalent to `setValue(null)`.                                                                                  |
| `.enable()`                  | `void`                       | Enables the control.                                                                                                                     |
| `.disable()`                 | `void`                       | Disables the control.                                                                                                                    |
| `.on(event, handler)`        | `void`                       | Subscribes to an event (see below).                                                                                                      |
| `.off(event, handler)`       | `void`                       | Unsubscribes a previously registered handler.                                                                                            |

## Events

| Event      | Payload                             | Meaning                                     |
| ---------- | ----------------------------------- | ------------------------------------------- |
| `change`   | `string \| string[] \| null`        | Aggregate value changed.                    |
| `select`   | `Option`                            | A user selected an option.                  |
| `unselect` | `Option`                            | A user removed an option.                   |
| `create`   | `Option`                            | Tags mode created a new option.             |
| `reorder`  | `string[]`                          | Sortable tags changed order.                |
| `maximum`  | `{ limit: number; option: Option }` | An interactive pick exceeded the limit.     |
| `open`     | _(none)_                            | Dropdown opened.                            |
| `close`    | _(none)_                            | Dropdown closed.                            |
| `search`   | `string`                            | Search query changed.                       |
| `clear`    | _(none)_                            | All selections were cleared through the UI. |
| `error`    | `Error`                             | Remote loading failed.                      |

```js
select.on("change", (value) => console.log(value));
select.on("search", (query) => console.log("searching:", query));
select.on("error", (error) => console.error(error));
```

Remote failures render a localized error row. A later search or reopening the dropdown retries the request; superseded requests are aborted automatically.

## Framework wrappers

The constructor/options/methods/events above are the core `forge-select` API. Official wrapper components expose the same functionality with framework-native conventions:

| Package                                                                  | Framework | Value binding             |
| ------------------------------------------------------------------------ | --------- | ------------------------- |
| [`forge-select-react`](https://www.npmjs.com/package/forge-select-react) | React     | `value` prop + `onChange` |
| [`forge-select-vue`](https://www.npmjs.com/package/forge-select-vue)     | Vue 3     | `v-model`                 |

`value`/`modelValue` and `data` are reactive in both wrappers. Templates, plugins, and other constructor-only options require a remount with a different framework `key`; see each package README for details.

## See also

- [Examples](./examples.md)
- [Migration from Select2](./migration-from-select2.md)
- [Plugin Development Guide](./plugin-development.md)
