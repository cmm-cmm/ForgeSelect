# ForgeSelect

«A modern, lightweight, highly customizable replacement for Select2.»

ForgeSelect is a next-generation JavaScript select component built for modern web applications. It provides a clean API, powerful customization options, excellent performance, and accessibility while remaining framework-agnostic.

## Why ForgeSelect?

Select2 has served the community well for many years, but modern web development has evolved.

ForgeSelect is designed to provide:

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

Full documentation lives in [`docs/`](./docs/README.md):

- [API Reference](./docs/api-reference.md) — constructor, options, methods, events
- [Examples](./docs/examples.md) — copy-pasteable snippets for every feature and framework
- [Playground](./docs/playground.md) — [live demo](https://cmm-cmm.github.io/ForgeSelect/demo/) on GitHub Pages
- [Migration from Select2](./docs/migration-from-select2.md) — option/event/method mapping and a migration checklist
- [Benchmarks](./docs/benchmarks.md) — performance methodology and results (planned)
- [Plugin Development Guide](./docs/plugin-development.md) — write and register your own plugins

## Features

- Single Select
- Multiple Select
- Searchable Dropdown
- Async Data Source (AJAX with debounce)
- Virtual Scrolling
- Custom Templates
- Tags Mode (create options from free text)
- Keyboard Navigation
- Disabled Options
- Option Groups
- Clear Selection
- Placeholder
- Custom Themes (CSS variables, dark mode included)
- Event System
- Plugin Architecture
- Internationalization (en/vi built in, custom string tables)
- TypeScript Support (written in strict TypeScript, ships `.d.ts`)
- Tree Select (planned)
- Infinite Scroll (planned)

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
    theme: "default"
});
```

See the [API Reference](./docs/api-reference.md) for all options, including `data`, `ajax`, `templateResult`, `templateSelection`, `virtualScroll`, `language`, and `plugins`.

## Events

```js
select.on("change", value => console.log(value));
select.on("open", () => {});
select.on("close", () => {});
select.on("search", query => console.log("searching:", query));
select.on("clear", () => {});
```

Unsubscribe with `select.off(event, handler)`.

## Examples

```js
new ForgeSelect("#users", {
    ajax: {
        url: query => `/api/users?q=${encodeURIComponent(query)}`,
        debounce: 300,
        transform: response => response.items.map(u => ({ value: u.id, label: u.name }))
    }
});
```

More copy-pasteable snippets (multi-select, tags, custom templates, virtual scrolling, React/Vue/Svelte) are in [`docs/examples.md`](./docs/examples.md).

## Playground

Try the live demo at **<https://cmm-cmm.github.io/ForgeSelect/demo/>** — single/multiple selects, tags, option groups, custom templates, virtual scrolling with 10,000 options, Vietnamese locale, an event log, and a dark-mode toggle. See [`docs/playground.md`](./docs/playground.md) for running it locally.

## API Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `placeholder` | `string` | `""` | Text shown when nothing is selected |
| `searchable` | `boolean` | `true` | Show a search input in the dropdown |
| `multiple` | `boolean` | `false` | Allow selecting more than one option |
| `theme` | `string` | `"default"` | Named theme applied to the control |

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

- Vanilla JavaScript
- React
- Vue
- Angular
- Svelte
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

ForgeSelect is designed as a drop-in-concept replacement for Select2: no jQuery dependency, native accessibility, and a smaller API surface. A full option/event/method mapping table and a step-by-step migration checklist are available in [`docs/migration-from-select2.md`](./docs/migration-from-select2.md).

## Benchmarks

Performance benchmarking (bundle size, init time, search latency, virtual scroll performance) against Select2 is planned once the first release ships. Methodology and the results format are documented in [`docs/benchmarks.md`](./docs/benchmarks.md).

## Roadmap

- [ ] Tree Select
- [x] Virtualized List
- [ ] Async Pagination
- [ ] Drag & Drop Ordering
- [ ] Theme Builder
- [x] CSS Variables
- [ ] React Component
- [ ] Vue Component
- [ ] Angular Component
- [ ] Svelte Component

## Plugin Development Guide

ForgeSelect uses a small plugin architecture (`onInit`, `onOpen`, `onClose`, `onDestroy` lifecycle hooks) so behavior can be extended without forking the core. See [`docs/plugin-development.md`](./docs/plugin-development.md) for the plugin interface and a complete example plugin.

## Development

```bash
npm install       # install dev dependencies
npm test          # run the vitest + jsdom test suite
npm run typecheck # strict TypeScript check
npm run build     # build ESM + CJS + type declarations into dist/
```

Source lives in `src/`, styles in `styles/forge-select.css`, and tests in `tests/`.

## Contributing

Contributions are welcome!

Please feel free to open an issue or submit a pull request.

## License

MIT License.

---

Built with ❤️ by KonexForge.
