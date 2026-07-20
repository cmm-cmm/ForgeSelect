# forge-select-react

React wrapper for [Forge Select](https://github.com/cmm-cmm/ForgeSelect) — a zero-dependency, accessible select/combobox component.

## Installation

```bash
npm install forge-select forge-select-react
```

`forge-select` is a peer of this package (installed automatically as a regular dependency); `react`/`react-dom` are peer dependencies you provide.

## Usage

```jsx
import { ForgeSelectReact } from "forge-select-react";
import "forge-select/styles.css";

function CountryPicker() {
  const [value, setValue] = useState(null);

  return (
    <ForgeSelectReact
      placeholder="Select a country"
      clearable
      data={[
        { value: "vn", label: "Vietnam" },
        { value: "jp", label: "Japan" },
      ]}
      value={value}
      onChange={setValue}
    />
  );
}
```

## API

`ForgeSelectReact` accepts every [`ForgeSelectOptions`](https://forgeselect.konexforge.com/docs/api-reference.html) field as a prop, plus:

- `value` — controlled value (`string | string[] | null`), kept in sync via `.setValue()` whenever it changes.
- `onChange` — called with the new value on the underlying `change` event.
- `className` — applied to the wrapper `<div>` Forge Select mounts into.

Updating `value` synchronizes the widget silently; `onChange` is reserved for user-initiated changes.

## Important limitation

Forge Select's own options (`data`, `templateResult`, `templateSelection`, `plugins`, etc.) are read once at construction time and are **not reactive** — the underlying instance is created once when the component mounts and only `value` is synced afterwards. To apply new `data`/templates/plugins, remount the component with a different `key` prop:

```jsx
<ForgeSelectReact key={datasetVersion} data={data} />
```

See the [Forge Select docs](https://forgeselect.konexforge.com/docs/) for the full option/event/method reference.
