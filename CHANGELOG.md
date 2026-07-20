# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Quality gates: ESLint, Prettier, 80% V8 coverage thresholds, generated-site/package validation, and Playwright coverage across Chromium, Firefox, and WebKit.
- Additive `setValue(value, { emitChange: false })` API and an `error` event/localized row for remote-load failures.
- Keyboard-operable tree navigation with `ArrowRight`/`ArrowLeft` and `aria-expanded` state.
- **Cloudflare deploy**: the site now deploys to Cloudflare (Workers with static assets, project `forge-select`) on every push to `main`, via a Workers Builds project connected directly to this repo through the Cloudflare Dashboard's Git integration (not a GitHub Actions workflow), configured by the new `wrangler.jsonc` at the repo root; see "Deploying the site" in `CONTRIBUTING.md`. Adds a `wrangler` dev dependency and a `deploy:cloudflare` script for manual/local deploys.
- **Drag & Drop Ordering**: `sortable: true` (multi-select only) lets users reorder selected tags by dragging with mouse/touch/pen (Pointer Events), or via `Alt+Left`/`Alt+Right` when a tag has keyboard focus. Fully opt-in — multi-select behavior, markup, and events are unchanged when `sortable` is left at its default `false`. When mounted on a native `<select multiple>`, the underlying `<option>` elements are also reordered to match, so a plain `<form>` submission serializes values in the dragged order.
- Live demo: new "Rich items — 1,000 users (multiple)" card showing the built-in `avatar`/`description` rich-item rendering combined with `multiple` + tags on a 1,000-item virtualized list.
- The React and Vue wrappers now forward `onOpen`/`onClose`/`onSearch`/`onClear`/`onError` props (React) and `open`/`close`/`search`/`clear`/`error` emits (Vue), matching the full `ForgeSelectEvent` union instead of only `change`.

### Changed

- The IIFE bundle (`dist/index.global.js`, the CDN/`<script>` build) is now minified — the ESM/CJS builds are unaffected.
- CI: added `concurrency` groups to `ci.yml`/`release.yml` so superseded runs don't queue redundantly, added an explicit `permissions: contents: read` block to `ci.yml`, and restructured steps so `dist/`/workspace builds run once per job instead of up to 3×.
- React/Vue controlled values now synchronize silently; callbacks and model events are reserved for user changes.
- Internal selection, native-select parsing, and remote normalization helpers are split into focused, directly tested modules.
- Site version badges are sourced from `package.json`, and generated local links are checked in CI.
- Site FAQ (landing page + JSON-LD) and docs no longer say React/Vue/Angular/Svelte wrappers are "on the roadmap but not yet available" — `forge-select-react` and `forge-select-vue` are published and documented in `docs/examples.md` and `docs/api-reference.md`; the live demo intro links to both.
- **Cloudflare is now the canonical live site**, at a custom domain: `https://forgeselect.konexforge.com/`. `homepage` in `package.json` (root + both wrapper packages) and every hardcoded canonical/OG/JSON-LD URL across `site/`, `demo/`, `README.md`, and `docs/` now point there instead of the old GitHub Pages URL.
- **Display name is now "Forge Select"** (with a space) everywhere it's used as a marketing/brand name — page titles, headings, meta tags, JSON-LD `name` fields, and prose across the site, `README.md`, and `docs/`. Code identifiers (`ForgeSelect` the TypeScript class, `ForgeSelectOptions`/`ForgeSelectPlugin` types, `forge-select`/`forge-select-react`/`forge-select-vue` npm package names, `.forge-select__*` CSS classes) and the `cmm-cmm/ForgeSelect` GitHub repository name are unaffected — those are technical identifiers, not the display name.
- **SEO/GEO pass on every site page** (informed by another KonexForge site's setup): added `keywords`, `robots`, `author`, `og:locale`, `og:image:alt`, and an explicit `<link rel="sitemap">` tag; homepage JSON-LD reorganized into a linked `WebSite` + `SoftwareApplication` graph (via matching `@id`/`isPartOf`) with a `featureList`, `applicationSubCategory`, `softwareHelp`, and `screenshot`; `llms.txt` generation now includes the version number.
- **Real PNG social-preview image**: `og-banner.svg` is now rasterized to a 1200×630 PNG at build time (new `sharp` dev dependency, not committed — generated fresh into `_site/assets/` on every build) and used for `og:image`/`twitter:image`/`apple-touch-icon` in place of the SVG, with `twitter:card` upgraded from `summary` to `summary_large_image`. Resolves the SVG-preview-inconsistency limitation noted in the 0.2.0 entry below (Twitter/X and LinkedIn don't render SVG `og:image` reliably).
- **Version badge**: the site header now shows the current version next to the brand name (e.g. "Forge Select v0.2.0") on every page, plus a version eyebrow line on the homepage hero — sourced from `package.json` at build time everywhere, including the hand-authored `site/index.html`/`demo/index.html`/`site/playground/index.html`/`site/theme-builder/index.html` pages, via a `{{FORGE_SELECT_VERSION}}` placeholder that `scripts/build-site.mjs` replaces at build time, so no manual bump is needed at release time (see `CONTRIBUTING.md`).

### Removed

- **GitHub Pages deployment** (`.github/workflows/pages.yml`) — retired now that Cloudflare is canonical. If a `gh-pages` branch and the GitHub Pages site are still active in this repo's Settings, they should be cleaned up manually (not something a workflow change can do).

### Fixed

- Abort and ignore stale AJAX responses immediately when a new debounced query is scheduled; reject unsuccessful HTTP responses.
- Preserve native selected/disabled/display state, inherited optgroup disabling, external changes, and form resets.
- Repair generated React/Vue changelog links and update the supported security version.
- `ajax.url` as a function now receives the current page number as a second argument, so `pagination: true` works with function-based URLs (it previously always fetched page 0).
- Pressing `ArrowUp` as the very first navigation keypress now highlights the last item, not the second-to-last.
- Selecting/deselecting a tree parent in multi-select mode no longer cascades onto disabled descendants — they were unreachable through the UI (excluded from keyboard/click navigation) and could get stuck permanently selected.
- `ajax.transform` returning a value that isn't an array or `{ options, hasMore }` now throws a clear error instead of silently producing a broken options list.
- The custom combobox control now forwards an accessible name from the original element's `aria-label`/`aria-labelledby`, or from an existing `<label for>` pointing at it — previously that association was lost once the original `<select>`/element became `display:none`.

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
- FAQ section on the homepage; introductory copy on the demo and playground pages so a visitor landing directly on either still gets context on what Forge Select is.
- The Changelog is now rendered on the site (`docs/changelog.html`), sourced from this file.
- **Theme Builder**: a new site page (`/theme-builder/`) for live-editing every `--fs-*` CSS variable against real Forge Select instances, starting from Light/Dark presets, with a one-click "Copy CSS" output. Site-only — no library code changes.
- **Async pagination**: `ajax.pagination` opts in to loading further pages as the user scrolls near the bottom of the dropdown, instead of only reloading on search (`params` now also receives the current `page`; `transform` may return `{ options, hasMore }` to control it). Fully backward compatible — existing `ajax` configs without `pagination` behave exactly as before, and cached row content is preserved across appended pages instead of being cleared.
- **Tree select**: add `children` to any `Option` to get an expandable/collapsible tree node, with cascading select/deselect and an indeterminate state for partially-selected parents in `multiple` mode. Purely additive — lists with no `children` anywhere render and behave exactly as before.
- **Framework wrapper packages**: new npm workspaces under `packages/` — [`forge-select-react`](./packages/react/CHANGELOG.md) and [`forge-select-vue`](./packages/vue/CHANGELOG.md), each a thin component wrapping the core library with controlled-value support (`onChange` / `v-model`). CI now also runs typecheck/test/build across workspaces after the core library's own steps. Published independently via their own tags (`react-v*`, `vue-v*`); unscoped names (rather than `@forge-select/*`) so publishing doesn't depend on first creating an npm organization.

### Fixed

- Playground stylesheet order so site accent overrides apply to Forge Select widgets.
- Virtual scroll rendering a mostly-blank window after scrolling: the viewport height was read from `list.clientHeight` _after_ the list's children were cleared, at which point the list (no explicit `height`, only `max-height`) collapses to its padding (~8px) instead of the real box height. This under-provisioned the rendered row window on every scroll-triggered re-render, leaving a visible blank gap at the bottom of the dropdown for any scroll position other than the very top.

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
