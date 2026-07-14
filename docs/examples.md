# Examples

> [Docs home](./README.md)

## Single select

```html
<select id="country">
  <option value="vn">Vietnam</option>
  <option value="jp">Japan</option>
  <option value="us">United States</option>
</select>
```

```js
import ForgeSelect from "forge-select";

new ForgeSelect("#country", {
  placeholder: "Select a country",
  searchable: true,
});
```

## Multiple select

```js
new ForgeSelect("#tags", {
  multiple: true,
  clearable: true,
  placeholder: "Select one or more",
});
```

## Reorderable tags (drag & drop)

```js
new ForgeSelect("#skills", {
  multiple: true,
  sortable: true,
  placeholder: "Select skills, then drag to reorder",
});
```

Drag a tag with the mouse, touch, or a pen to reorder it; with a tag focused, `Alt+Left`/`Alt+Right` does the same via keyboard. `getValue()` (and the `change` event) always reflect the current tag order — on a native `<select multiple>`, the underlying `<option>` elements are reordered to match too, so a plain `<form>` submission serializes values in the dragged order.

## Async / AJAX data source

```js
new ForgeSelect("#users", {
  ajax: {
    url: (query) => `/api/users?q=${encodeURIComponent(query)}`,
    debounce: 300,
    transform: (response) =>
      response.items.map((u) => ({ value: u.id, label: u.name })),
  },
});
```

## Async pagination (load more on scroll)

```js
new ForgeSelect("#users", {
  ajax: {
    url: "/api/users",
    pagination: true,
    params: (query, page) => ({ q: query, page }),
    transform: (response) => ({
      options: response.items.map((u) => ({ value: u.id, label: u.name })),
      hasMore: response.hasMore,
    }),
  },
});
```

Scrolling near the bottom of the dropdown fetches the next page and appends it to the list instead of replacing it; typing a new search query still resets back to page 0 as usual.

## Tags mode (allow creating new options)

```js
new ForgeSelect("#skills", {
  multiple: true,
  allowCreate: true,
  placeholder: "Add a skill",
});
```

## Custom templates

```js
new ForgeSelect("#country", {
  templateResult: (option) => `<span class="flag flag-${option.value}"></span> ${option.label}`,
  templateSelection: (option) => option.label,
});
```

## Option groups

```js
new ForgeSelect("#country", {
  data: [
    {
      label: "Asia",
      options: [
        { value: "vn", label: "Vietnam" },
        { value: "jp", label: "Japan" },
      ],
    },
    {
      label: "Americas",
      options: [{ value: "us", label: "United States" }],
    },
  ],
});
```

## Tree select (nested options)

```js
new ForgeSelect("#categories", {
  multiple: true,
  data: [
    {
      value: "electronics", label: "Electronics",
      children: [
        { value: "phones", label: "Phones" },
        { value: "laptops", label: "Laptops" },
      ],
    },
    {
      value: "clothing", label: "Clothing",
      children: [
        { value: "shirts", label: "Shirts" },
        { value: "shoes", label: "Shoes" },
      ],
    },
  ],
});
```

Nodes with `children` start collapsed; click the twisty (▶/▼) to expand. In `multiple` mode, selecting "Electronics" also selects "Phones" and "Laptops"; selecting only some of a parent's descendants shows it as indeterminate.

## Rich items (avatar + name + description)

Options with `avatar`/`description` get a built-in rich layout — no template needed, and the fields are XSS-safe:

```js
new ForgeSelect("#users", {
  itemHeight: 52, // taller rows for the two-line layout
  data: [
    {
      value: "1",
      label: "Ana Trần",
      description: "ana@example.com",
      avatar: "https://example.com/avatars/ana.png",
    },
    // …works great with 1,000+ items: virtualization kicks in automatically
  ],
});
```

The same data can be rendered with a fully custom template instead. Prefer returning a **DOM Node** built with `textContent` — it stays XSS-safe even when the data comes from users or a remote API (a string return value is injected as raw HTML, so only use it with trusted or pre-sanitized content):

```js
new ForgeSelect("#users", {
  templateResult: (o) => {
    const row = document.createElement("span");
    const img = document.createElement("img");
    img.className = "my-avatar";
    if (/^(https:|data:image\/)/.test(o.avatar ?? "")) img.src = o.avatar;
    const name = document.createElement("strong");
    name.textContent = o.label;
    const email = document.createElement("small");
    email.textContent = o.description ?? "";
    row.append(img, name, email);
    return row;
  },
  templateSelection: (o) => {
    const span = document.createElement("span");
    span.textContent = o.label;
    return span;
  },
});
```

## Virtual scrolling (large lists)

Lists over ~100 rows are virtualized automatically — only the visible window is in the DOM, and row content is cached so templates run once per option. Set `virtualScroll: false` to opt out, or `itemHeight` if your rows are taller than the default 36px:

```js
new ForgeSelect("#big-list", {
  data: largeArrayOfThousandsOfOptions, // nothing else to configure
});
```

## React

The official [`forge-select-react`](https://www.npmjs.com/package/forge-select-react) package wraps Forge Select in a controlled component — no manual mounting required:

```bash
npm install forge-select forge-select-react
```

```jsx
import { useState } from "react";
import { ForgeSelectReact } from "forge-select-react";
import "forge-select/styles.css";

function CountrySelect() {
  const [value, setValue] = useState(null);

  return (
    <ForgeSelectReact
      searchable
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

`data`, `templateResult`, `plugins`, and other constructor-only options are read once at mount; remount with a different `key` to change them. See the [package README](https://github.com/cmm-cmm/ForgeSelect/blob/main/packages/react/README.md) for the full prop reference.

If you'd rather not add the extra dependency, mount the core library directly:

```jsx
import { useEffect, useRef } from "react";
import ForgeSelect from "forge-select";

function CountrySelect() {
  const ref = useRef(null);

  useEffect(() => {
    const select = new ForgeSelect(ref.current, { searchable: true });
    select.on("change", (value) => console.log(value));
    return () => select.destroy();
  }, []);

  return (
    <select ref={ref}>
      <option value="vn">Vietnam</option>
      <option value="jp">Japan</option>
    </select>
  );
}
```

## Vue

The official [`forge-select-vue`](https://www.npmjs.com/package/forge-select-vue) package wraps Forge Select as a Vue 3 component with `v-model` support:

```bash
npm install forge-select forge-select-vue
```

```vue
<script setup>
import { ref } from "vue";
import { ForgeSelectVue } from "forge-select-vue";
import "forge-select/styles.css";

const value = ref(null);
const options = {
  searchable: true,
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

`options` is read once when the instance is created; force a remount with a different `:key` to apply new `data`/templates/plugins. See the [package README](https://github.com/cmm-cmm/ForgeSelect/blob/main/packages/vue/README.md) for the full reference.

If you'd rather not add the extra dependency, mount the core library directly:

```vue
<template>
  <select ref="el">
    <option value="vn">Vietnam</option>
    <option value="jp">Japan</option>
  </select>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import ForgeSelect from "forge-select";

const el = ref(null);
let select;

onMounted(() => {
  select = new ForgeSelect(el.value, { searchable: true });
});

onBeforeUnmount(() => select?.destroy());
</script>
```

## Svelte

```svelte
<script>
  import { onMount, onDestroy } from "svelte";
  import ForgeSelect from "forge-select";

  let el;
  let select;

  onMount(() => {
    select = new ForgeSelect(el, { searchable: true });
  });

  onDestroy(() => select?.destroy());
</script>

<select bind:this={el}>
  <option value="vn">Vietnam</option>
  <option value="jp">Japan</option>
</select>
```

## See also

- [API Reference](./api-reference.md)
- [Playground](./playground.md)
