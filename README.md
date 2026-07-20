# Forge Select

[![npm version](https://img.shields.io/npm/v/forge-select.svg)](https://www.npmjs.com/package/forge-select)
[![CI](https://github.com/cmm-cmm/ForgeSelect/actions/workflows/ci.yml/badge.svg)](https://github.com/cmm-cmm/ForgeSelect/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

«A modern, lightweight, highly customizable replacement for Select2.»

Forge Select is a next-generation JavaScript select component built for modern web applications. It provides a clean API, powerful customization options, excellent performance, and accessibility while remaining framework-agnostic.

## Why Forge Select?

Select2 has served the community well for many years, but modern web development has evolved.

Forge Select is designed to provide:

- 🚀 High performance
- 🎨 Fully customizable UI
- 📱 Responsive and mobile-friendly
- ♿ Accessibility (ARIA) support
- 🔍 Fast searching
- 🌳 Nested option groups
- 🏷️ Single & multiple selection
- 🧩 Plugin architecture
- 🌐 AJAX & remote data loading
- 🌙 Dark mode support
- 🌍 Internationalization (i18n)
- 📦 Zero dependency

## Documentation

Browse the documentation website at **<https://forgeselect.konexforge.com/docs/>**, or read the sources in [`docs/`](./docs/README.md):

- [API Reference](./docs/api-reference.md) — constructor, options, methods, events
- [Examples](./docs/examples.md) — copy-pasteable snippets for every feature and framework
- [Playground](./docs/playground.md) — [live demo](https://forgeselect.konexforge.com/demo/)
- [Migration from Select2](./docs/migration-from-select2.md) — option/event/method mapping and a migration checklist
- [Benchmarks](./docs/benchmarks.md) — performance methodology and results (planned)
- [Plugin Development Guide](./docs/plugin-development.md) — write and register your own plugins

## Features

- Single Select
- Multiple Select
- Searchable Dropdown
- Async Data Source (AJAX with debounce, optional infinite-scroll pagination)
- Rich Item Rendering (avatar + label + description, XSS-safe built-in fields)
- Virtual Scrolling (automatic for large lists, with per-option render caching)
- Custom Templates
- Tags Mode (create options from free text)
- Keyboard Navigation
- Disabled Options
- Option Groups
- Tree Select (nested options with expand/collapse and cascading multi-select)
- Drag & Drop Tag Ordering (reorder a multi-select's selected tags by mouse/touch/pen, or Alt+Left/Alt+Right on keyboard)
- Clear Selection
- Placeholder
- Custom Themes (CSS variables, dark mode included)
- Event System
- Plugin Architecture
- Internationalization (en/vi built in, custom string tables)
- TypeScript Support (written in strict TypeScript, ships `.d.ts`)

> Planned/in-progress capabilities — Angular/Svelte wrappers — are tracked in the [Roadmap](#roadmap) below and intentionally not listed above as shipped features.

## Installation

```bash
npm install forge-select
# or
yarn add forge-select
# or
pnpm add forge-select
```

## Quick Start

```html
<select id="country">
  <option value="vn">Vietnam</option>
  <option value="jp">Japan</option>
  <option value="us">United States</option>
</select>
```

```js
import ForgeSelect from "forge-select";
import "forge-select/styles.css";

new ForgeSelect("#country");
```

## Configuration

```js
const select = new ForgeSelect("#country", {
  placeholder: "Select a country",
  searchable: true,
  multiple: false,
  clearable: true,
  allowCreate: false,
  theme: "default",
});
```

See the [API Reference](./docs/api-reference.md) for all options, including `data`, `ajax`, `templateResult`, `templateSelection`, `virtualScroll`, `language`, and `plugins`.

## Events

```js
select.on("change", (value) => console.log(value));
select.on("open", () => {});
select.on("close", () => {});
select.on("search", (query) => console.log("searching:", query));
select.on("clear", () => {});
select.on("error", (error) => console.error(error));
```

Unsubscribe with `select.off(event, handler)`.

Use `select.setValue(value, { emitChange: false })` to synchronize external controlled state without emitting `change`.

## Examples

```js
new ForgeSelect("#users", {
  ajax: {
    url: (query) => `/api/users?q=${encodeURIComponent(query)}`,
    debounce: 300,
    transform: (response) => response.items.map((u) => ({ value: u.id, label: u.name })),
  },
});
```

More copy-pasteable snippets (multi-select, tags, custom templates, virtual scrolling, React/Vue/Svelte) are in [`docs/examples.md`](./docs/examples.md).

## Playground

Write and run Forge Select code in the browser at **<https://forgeselect.konexforge.com/playground/>** — with presets for every major feature. A curated feature showcase also lives at **<https://forgeselect.konexforge.com/demo/>**. See [`docs/playground.md`](./docs/playground.md) for details and local setup.

## API Reference

| Option        | Type      | Default     | Description                          |
| ------------- | --------- | ----------- | ------------------------------------ |
| `placeholder` | `string`  | `""`        | Text shown when nothing is selected  |
| `searchable`  | `boolean` | `true`      | Show a search input in the dropdown  |
| `multiple`    | `boolean` | `false`     | Allow selecting more than one option |
| `theme`       | `string`  | `"default"` | Named theme applied to the control   |

Full constructor signature, all options, instance methods, and events are documented in [`docs/api-reference.md`](./docs/api-reference.md).

## Theming

Styling is driven entirely by CSS custom properties, and a dark theme ships out of the box:

```js
new ForgeSelect("#country", { theme: "dark" });
```

```css
.forge-select {
  --fs-border-focus: #e11d48;
  --fs-radius: 4px;
}
```

## Framework Support

Forge Select is vanilla TypeScript/JavaScript, so it can be mounted inside any framework today. Official wrapper packages exist for a couple of them:

- Vanilla JavaScript
- React — via [`forge-select-react`](./packages/react/README.md) (`ForgeSelectReact` component, controlled `value`/`onChange`)
- Vue — via [`forge-select-vue`](./packages/vue/README.md) (`ForgeSelectVue` component, `v-model` support)
- Angular — mount manually for now; a dedicated wrapper is on the [Roadmap](#roadmap)
- Svelte — mount manually for now; a dedicated wrapper is on the [Roadmap](#roadmap)
- Next.js
- Nuxt
- Astro

## Browser Support

- Chrome
- Edge
- Firefox
- Safari
- Mobile Browsers

## Migration from Select2

Forge Select is designed as a drop-in-concept replacement for Select2: no jQuery dependency, native accessibility, and a smaller API surface. A full option/event/method mapping table and a step-by-step migration checklist are available in [`docs/migration-from-select2.md`](./docs/migration-from-select2.md).

## Benchmarks

Performance benchmarking (bundle size, init time, search latency, virtual scroll performance) against Select2 is planned but not yet run. Methodology and the results format are documented in [`docs/benchmarks.md`](./docs/benchmarks.md).

## Roadmap

- [x] Tree Select
- [x] Virtualized List
- [x] Async Pagination
- [x] Drag & Drop Ordering
- [x] Theme Builder
- [x] CSS Variables
- [x] React Component
- [x] Vue Component
- [ ] Angular Component
- [ ] Svelte Component

## Plugin Development Guide

Forge Select uses a small plugin architecture (`onInit`, `onOpen`, `onClose`, `onDestroy` lifecycle hooks) so behavior can be extended without forking the core. See [`docs/plugin-development.md`](./docs/plugin-development.md) for the plugin interface and a complete example plugin.

## Development

```bash
npm install       # install dev dependencies
npm test          # run the vitest + jsdom test suite
npm run typecheck # strict TypeScript check
npm run build     # build ESM + CJS + type declarations into dist/
```

Source lives in `src/`, styles in `styles/forge-select.css`, and tests in `tests/`.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development setup, project layout, and PR guidelines. Release history lives in [CHANGELOG.md](./CHANGELOG.md), and security reports should follow [SECURITY.md](./SECURITY.md). This project follows a [Code of Conduct](./CODE_OF_CONDUCT.md); by participating you agree to abide by its terms.

## License

[MIT License](./LICENSE).

---

Built with ❤️ by KonexForge.
