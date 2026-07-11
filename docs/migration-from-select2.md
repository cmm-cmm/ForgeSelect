# Migration from Select2

> [Docs home](./README.md)

Select2 has served the ecosystem well, but it depends on jQuery and predates modern accessibility and performance practices. ForgeSelect is designed as a drop-in-*concept* replacement: same core ideas (searchable dropdowns, tags, AJAX, templates), zero dependencies, and a smaller, framework-agnostic API.

## Why migrate?

- No jQuery dependency required.
- Smaller bundle size and no dependency on a full DOM utility library.
- Native accessibility (ARIA) support out of the box.
- A plugin architecture for extending behavior, instead of monkey-patching.

## Option mapping

| Select2 option | ForgeSelect option | Notes |
|---|---|---|
| `placeholder` | `placeholder` | Same meaning. |
| `multiple` (on the `<select>` element) | `multiple` | ForgeSelect takes it as an explicit option instead of relying on the native `multiple` attribute alone. |
| `allowClear` | `clearable` | Same meaning. |
| `tags: true` | `allowCreate: true` + `multiple: true` | Split into two explicit flags. |
| `ajax` | `ajax` | Shape differs — see [API Reference](./api-reference.md#ajaxconfig-shape). |
| `templateResult` | `templateResult` | Same purpose, may return a string or a DOM node. |
| `templateSelection` | `templateSelection` | Same purpose. |
| `theme` | `theme` | ForgeSelect ships CSS-variable-based themes instead of a bundled theme name registry. |
| `language` | `language` | Accepts a locale code or a custom string table. |
| `minimumInputLength` / `minimumResultsForSearch` | *(planned)* | Not yet available; track in the [Roadmap](../README.md#roadmap). |

## Event mapping

| Select2 event | ForgeSelect event |
|---|---|
| `select2:select` / `select2:unselect` | `change` |
| `select2:open` | `open` |
| `select2:close` | `close` |
| *(no direct equivalent)* | `search` |
| *(no direct equivalent)* | `clear` |

## Method mapping

| Select2 (jQuery) call | ForgeSelect call |
|---|---|
| `$('#el').select2(options)` | `new ForgeSelect('#el', options)` |
| `$('#el').val(value).trigger('change')` | `select.setValue(value)` |
| `$('#el').val()` | `select.getValue()` |
| `$('#el').select2('open')` | `select.open()` |
| `$('#el').select2('close')` | `select.close()` |
| `$('#el').select2('destroy')` | `select.destroy()` |
| `$('#el').prop('disabled', true)` | `select.disable()` |
| `$('#el').on('select2:select', fn)` | `select.on('change', fn)` |

## Step-by-step migration checklist

1. Remove the jQuery and Select2 script/style includes.
2. Install ForgeSelect: `npm install forge-select`.
3. Replace `$(el).select2(options)` calls with `new ForgeSelect(el, options)`, keeping a reference to the returned instance.
4. Rename options per the [option mapping](#option-mapping) table above.
5. Replace jQuery event bindings (`select2:select`, etc.) with `select.on(...)` calls per the [event mapping](#event-mapping) table.
6. Replace direct jQuery method calls (`.select2('open')`, `.val()`, etc.) with the equivalent instance method from the [method mapping](#method-mapping) table.
7. Re-apply any custom Select2 theme CSS as ForgeSelect CSS variables/theme classes.
8. Run your test suite and manually verify keyboard navigation and screen-reader behavior, since ForgeSelect's accessibility model differs from Select2's.

## See also

- [API Reference](./api-reference.md)
- [Examples](./examples.md)
