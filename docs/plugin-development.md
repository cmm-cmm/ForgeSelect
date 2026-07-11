# Plugin Development Guide

> [Docs home](./README.md)

ForgeSelect is built around a small plugin architecture so behavior can be extended without forking the core. A plugin is a plain object with lifecycle hooks that ForgeSelect calls at the right time.

## Plugin interface

```ts
interface ForgeSelectPlugin {
  name: string;
  onInit?(select: ForgeSelect): void;
  onOpen?(select: ForgeSelect): void;
  onClose?(select: ForgeSelect): void;
  onDestroy?(select: ForgeSelect): void;
}
```

- `name` — a unique identifier, used in error messages and for debugging.
- `onInit` — called once, right after the instance is created and the DOM is built.
- `onOpen` / `onClose` — called every time the dropdown opens/closes.
- `onDestroy` — called when `.destroy()` runs; use it to clean up listeners/timers the plugin added.

All hooks are optional — implement only the ones your plugin needs.

## Registering a plugin

```js
import ForgeSelect from "forge-select";
import clearOnEscape from "./clear-on-escape-plugin";

new ForgeSelect("#country", {
  plugins: [clearOnEscape],
});
```

Plugins run in the order they're listed. Multiple instances can share the same plugin object as long as the plugin doesn't keep instance-specific state on itself (keep instance state on `select` or in a closure per call).

## Example: a complete plugin

A plugin that clears the selection when the user presses <kbd>Escape</kbd> while the dropdown is closed:

```js
// clear-on-escape-plugin.js
export default {
  name: "clear-on-escape",

  onInit(select) {
    this._handler = (event) => {
      if (event.key === "Escape") {
        select.setValue(null);
      }
    };
    select.el.addEventListener("keydown", this._handler);
  },

  onDestroy(select) {
    select.el.removeEventListener("keydown", this._handler);
  },
};
```

## Guidelines for authoring plugins

- Keep plugins single-purpose — prefer composing several small plugins over one that does everything.
- Always remove listeners/timers added in `onInit`/`onOpen` inside `onDestroy` to avoid leaks.
- Don't mutate options the user passed in; read from `select` instead.
- Emit custom events via `select.on`/internal event bus conventions rather than calling consumer callbacks directly, so plugin behavior composes with `.on()` listeners.
- Document the options your plugin reads/writes on the `select` instance, since there's no separate plugin-options namespace.

## See also

- [API Reference](./api-reference.md)
- [Examples](./examples.md)
