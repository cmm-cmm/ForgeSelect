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

| Option | Type | Default | Description |
|---|---|---|---|
| `placeholder` | `string` | `""` | Text shown when nothing is selected. |
| `searchable` | `boolean` | `true` | Show a search input inside the dropdown. |
| `multiple` | `boolean` | `false` | Allow selecting more than one option. |
| `clearable` | `boolean` | `false` | Show a button to clear the current selection. |
| `allowCreate` | `boolean` | `false` | Let the user create a new option from free text (tags mode). |
| `theme` | `string` | `"default"` | Named theme applied via a `data-theme` attribute / CSS class. |
| `disabled` | `boolean` | `false` | Render the control as disabled. |
| `data` | `Array<Option \| OptionGroup>` | `undefined` | Static options, used instead of `<option>` children. |
| `ajax` | `AjaxConfig` | `undefined` | Remote data source config (`url`, `params`, `debounce`, `pagination`, `transform`). |
| `templateResult` | `(option) => string \| Node` | `undefined` | Custom renderer for dropdown list items. |
| `templateSelection` | `(option) => string \| Node` | `undefined` | Custom renderer for the selected value display. |
| `virtualScroll` | `boolean` | *(auto)* | `true`/unset = virtualize once the list exceeds ~100 rows; `false` = never virtualize. |
| `itemHeight` | `number` | `36` | Row height in px used by the virtual scroller. Raise it (e.g. `52`) for rich items with avatars/descriptions. |
| `language` | `string \| Record<string, string>` | `"en"` | Locale code or a custom string table for i18n. |
| `plugins` | `Array<ForgeSelectPlugin>` | `[]` | Plugins to register on this instance. See the [Plugin Development Guide](./plugin-development.md). |

### `Option` shape

```ts
interface Option {
  value: string;
  label: string;
  disabled?: boolean;
  avatar?: string;                 // image URL/data URI, shown as a round avatar
  description?: string;            // secondary line under the label
  meta?: Record<string, unknown>;  // arbitrary payload for custom templates
  children?: Option[];             // nested options — makes this a tree node
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
      value: "fruits", label: "Fruits",
      children: [
        { value: "apple", label: "Apple" },
        { value: "banana", label: "Banana" },
      ],
    },
  ],
});
```

Nodes with children start collapsed and show a twisty (▶/▼) to expand/collapse; searching shows a node if it or any descendant matches, temporarily auto-expanding matching branches without disturbing manually-expanded state. In `multiple: true` mode, selecting a parent selects/deselects all of its descendants, and a parent whose descendants are only partially selected gets the `forge-select__option--indeterminate` class.

### Rich items

When an option has `avatar` and/or `description` and no custom template is set, ForgeSelect renders them with a built-in layout (avatar + label + description in the dropdown; small avatar + label in the selected value/tags). All built-in fields are inserted via `textContent`, so they are **XSS-safe** — no escaping needed on your side. `description` is also matched by the search filter.

Custom templates (`templateResult`/`templateSelection`) receive the full option including `meta`. A **string** return value is injected as raw HTML — sanitize any user-provided data yourself. Rendered row content is cached per option value and cloned on scroll, so templates run once per option regardless of scrolling; if your template returns a DOM **Node**, don't rely on event listeners attached inside it (clones don't carry listeners — use event delegation on the document instead).

### `AjaxConfig` shape

```ts
interface AjaxConfig {
  url: string | ((query: string) => string);
  params?: (query: string, page: number) => Record<string, unknown>;
  debounce?: number; // ms, default 250
  pagination?: boolean; // opt in to loading further pages on scroll; default false
  transform?: (response: unknown) => Option[] | { options: Option[]; hasMore: boolean };
}
```

By default `ajax` replaces the whole list on every search (`transform` returns a plain `Option[]`, as above). Set `pagination: true` to additionally load more pages as the user scrolls near the bottom of the dropdown: `params` now also receives the current `page` (starting at `0`), and `transform` should return `{ options, hasMore }` so ForgeSelect knows whether to keep requesting further pages. A search query change always resets back to page `0` and replaces the list, regardless of `pagination`. See [Examples](./examples.md) for a full snippet.

## Instance methods

| Method | Returns | Description |
|---|---|---|
| `.open()` | `void` | Opens the dropdown. |
| `.close()` | `void` | Closes the dropdown. |
| `.destroy()` | `void` | Removes ForgeSelect and restores the original element. |
| `.getValue()` | `string \| string[] \| null` | Returns the current value(s). |
| `.setValue(value)` | `void` | Programmatically sets the current value(s). |
| `.enable()` | `void` | Enables the control. |
| `.disable()` | `void` | Disables the control. |
| `.on(event, handler)` | `void` | Subscribes to an event (see below). |
| `.off(event, handler)` | `void` | Unsubscribes a previously registered handler. |

## Events

| Event | Payload | Fired when |
|---|---|---|
| `change` | `value` | The selection changes. |
| `open` | — | The dropdown opens. |
| `close` | — | The dropdown closes. |
| `search` | `query: string` | The search input value changes. |
| `clear` | — | The selection is cleared via the clear button. |

```js
select.on("change", (value) => console.log(value));
select.on("search", (query) => console.log("searching:", query));
```

## See also

- [Examples](./examples.md)
- [Migration from Select2](./migration-from-select2.md)
- [Plugin Development Guide](./plugin-development.md)
