# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Drag & Drop Ordering**: `sortable: true` (multi-select only) lets users reorder selected tags by dragging with mouse/touch/pen (Pointer Events), or via `Alt+Left`/`Alt+Right` when a tag has keyboard focus. Fully opt-in — multi-select behavior, markup, and events are unchanged when `sortable` is left at its default `false`. When mounted on a native `<select multiple>`, the underlying `<option>` elements are also reordered to match, so a plain `<form>` submission serializes values in the dragged order.

### Changed

- Site FAQ (landing page + JSON-LD) and docs no longer say React/Vue/Angular/Svelte wrappers are "on the roadmap but not yet available" — `forge-select-react` and `forge-select-vue` are published and documented in `docs/examples.md` and `docs/api-reference.md`; the live demo intro links to both.

## [0.2.0] - 2026-07-14

### Changed

- Website rebranded with a green accent palette and a cursor logo/favicon across all pages.
- README Features list no longer lists unshipped items ("Tree Select", "Infinite Scroll") as if they were available; a pointer to the Roadmap replaces them.

### Added

- `CHANGELOG.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1).
- `.github/workflows/release.yml`: publishes to npm with provenance on `vX.Y.Z` tags (or manual dispatch), gated on typecheck/test/build and a tag/version match check.
- `homepage`, `bugs`, `engines`, and `publishConfig` fields in `package.json`; `prepublishOnly` runs the full verification suite before any publish.
- SEO: canonical links, Open Graph, and Twitter Card meta tags on every page. The preview image (`site/assets/og-banner.svg`) is a temporary SVG banner — some platforms (Twitter/X, LinkedIn) render SVG `og:image`/`twitter:image` inconsistently; swap for a PNG once raster-image tooling is available.
- GEO: JSON-LD structured data (`SoftwareApplication`, `FAQPage`, `BreadcrumbList`, `TechArticle` on docs pages) plus generated `sitemap.xml`, `robots.txt`, and `llms.txt`, all sourced from a single page-metadata list in `scripts/build-site.mjs`.
- FAQ section on the homepage; introductory copy on the demo and playground pages so a visitor landing directly on either still gets context on what ForgeSelect is.
- The Changelog is now rendered on the site (`docs/changelog.html`), sourced from this file.
- **Theme Builder**: a new site page (`/theme-builder/`) for live-editing every `--fs-*` CSS variable against real ForgeSelect instances, starting from Light/Dark presets, with a one-click "Copy CSS" output. Site-only — no library code changes.
- **Async pagination**: `ajax.pagination` opts in to loading further pages as the user scrolls near the bottom of the dropdown, instead of only reloading on search (`params` now also receives the current `page`; `transform` may return `{ options, hasMore }` to control it). Fully backward compatible — existing `ajax` configs without `pagination` behave exactly as before, and cached row content is preserved across appended pages instead of being cleared.
- **Tree select**: add `children` to any `Option` to get an expandable/collapsible tree node, with cascading select/deselect and an indeterminate state for partially-selected parents in `multiple` mode. Purely additive — lists with no `children` anywhere render and behave exactly as before.
- **Framework wrapper packages**: new npm workspaces under `packages/` — [`forge-select-react`](./packages/react/CHANGELOG.md) and [`forge-select-vue`](./packages/vue/CHANGELOG.md), each a thin component wrapping the core library with controlled-value support (`onChange` / `v-model`). CI now also runs typecheck/test/build across workspaces after the core library's own steps. Published independently via their own tags (`react-v*`, `vue-v*`); unscoped names (rather than `@forge-select/*`) so publishing doesn't depend on first creating an npm organization.

### Fixed

- Playground stylesheet order so site accent overrides apply to ForgeSelect widgets.
- Virtual scroll rendering a mostly-blank window after scrolling: the viewport height was read from `list.clientHeight` *after* the list's children were cleared, at which point the list (no explicit `height`, only `max-height`) collapses to its padding (~8px) instead of the real box height. This under-provisioned the rendered row window on every scroll-triggered re-render, leaving a visible blank gap at the bottom of the dropdown for any scroll position other than the very top.

## [0.1.0] - 2026-07-12

### Added

- **Core library**: `ForgeSelect` class with options (`placeholder`, `searchable`, `multiple`, `clearable`, `allowCreate`, `theme`, `disabled`, `data`, `ajax`, `templateResult`/`templateSelection`, `virtualScroll`, `itemHeight`, `language`, `plugins`), instance methods (`open`, `close`, `destroy`, `getValue`, `setValue`, `enable`, `disable`, `on`, `off`), and events (`change`, `open`, `close`, `search`, `clear`).
- **Rich items**: built-in `avatar`, `description`, and `meta` fields on `Option` with an XSS-safe layout; search also matches descriptions.
- **Performance**: automatic virtualization for lists over ~100 rows, per-option render caching (FIFO-bounded), lazy-loaded avatars, and a `scrollTop` capture/restore fix for real-browser scrolling.
- **Plugin architecture**: `onInit`, `onOpen`, `onClose`, `onDestroy` lifecycle hooks.
- **Theming**: CSS-variable-driven default and dark themes.
- **i18n**: built-in `en`/`vi` locales and custom string tables.
- **Tooling**: strict TypeScript, tsup build (ESM + CJS + IIFE + `.d.ts`), vitest + jsdom test suite, GitHub Actions CI, GitHub Pages deployment.
- **Website**: landing page, rendered documentation, interactive playground, and feature demo at <https://cmm-cmm.github.io/ForgeSelect/>.
- **Documentation**: API reference, examples, playground guide, Select2 migration guide, benchmarks methodology, and plugin development guide under `docs/`.

[Unreleased]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/cmm-cmm/ForgeSelect/releases/tag/v0.1.0
