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
| `ajax` | `AjaxConfig` | `undefined` | Remote data source config (`url`, `params`, `debounce`, `transform`). |
| `templateResult` | `(option) => string \| Node` | `undefined` | Custom renderer for dropdown list items. |
| `templateSelection` | `(option) => string \| Node` | `undefined` | Custom renderer for the selected value display. |
| `virtualScroll` | `boolean` | `false` | Enable virtualized rendering for large option lists. |
| `language` | `string \| Record<string, string>` | `"en"` | Locale code or a custom string table for i18n. |
| `plugins` | `Array<ForgeSelectPlugin>` | `[]` | Plugins to register on this instance. See the [Plugin Development Guide](./plugin-development.md). |

### `Option` shape

```ts
interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface OptionGroup {
  label: string;
  options: Option[];
}
```

### `AjaxConfig` shape

```ts
interface AjaxConfig {
  url: string | ((query: string) => string);
  params?: (query: string) => Record<string, unknown>;
  debounce?: number; // ms, default 250
  transform?: (response: unknown) => Option[];
}
```

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
