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

## Virtual scrolling (large lists)

```js
new ForgeSelect("#big-list", {
  virtualScroll: true,
  data: largeArrayOfThousandsOfOptions,
});
```

## React

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
