# forge-select-vue

Vue 3 wrapper for [Forge Select](https://github.com/cmm-cmm/ForgeSelect) — a zero-dependency, accessible select/combobox component.

## Installation

```bash
npm install forge-select forge-select-vue
```

`forge-select` is a peer of this package (installed automatically as a regular dependency); `vue` (3.2+) is a peer dependency you provide.

## Usage

```vue
<script setup>
import { ref } from "vue";
import { ForgeSelectVue } from "forge-select-vue";
import "forge-select/styles.css";

const value = ref(null);
const options = {
  placeholder: "Select a country",
  clearable: true,
  data: [
    { value: "vn", label: "Vietnam" },
    { value: "jp", label: "Japan" },
  ],
};
</script>

<template>
  <ForgeSelectVue :options="options" v-model="value" />
</template>
```

## API

- `options` — a single object bundling every [`ForgeSelectOptions`](https://forgeselect.konexforge.com/docs/api-reference.html) field (`placeholder`, `data`, `multiple`, `ajax`, `templateResult`, `plugins`, ...).
- `modelValue` / `v-model` — controlled value (`string | string[] | null`), kept in sync via `.setValue()` whenever it changes.
- `change` event — also emitted alongside `update:modelValue`, carrying the same value, for consumers not using `v-model`.

Updating `modelValue` synchronizes the widget silently; `update:modelValue` and `change` are reserved for user-initiated changes.

## Important limitation

`options` is read once when the underlying Forge Select instance is created and is **not reactive** — changing `data`, `templateResult`, `plugins`, etc. after mount has no effect on the existing instance. To apply new options, force a remount with a different `:key`:

```vue
<ForgeSelectVue :key="datasetVersion" :options="options" v-model="value" />
```

See the [Forge Select docs](https://forgeselect.konexforge.com/docs/) for the full option/event/method reference.
