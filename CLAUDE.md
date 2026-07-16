# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                # run the vitest + jsdom suite (tests/**/*.test.ts)
npm run test:watch      # tests in watch mode
npm run typecheck       # tsc --noEmit, strict mode
npm run build           # tsup: builds ESM + CJS + IIFE bundles and .d.ts into dist/
npm run build:site      # build the library, then assemble _site/ (docs/demo/playground)
```

Run a single test file with `npx vitest run tests/forge-select.test.ts`, or filter by name with `npx vitest run -t "pattern"`.

`npm run prepublishOnly` chains typecheck → test → build; CI (`.github/workflows/ci.yml`) runs the same three steps on every push/PR to `main` and must pass.

There is currently one test file: `tests/forge-select.test.ts`. jsdom cannot model real layout (e.g. `scrollTop` clamping during virtual scroll), so scroll/visual behavior needs manual verification in a real browser — don't trust jsdom results for that class of bug.

## Architecture

This is a zero-runtime-dependency, framework-agnostic TypeScript select/combobox component (a Select2 replacement). The entire library is five files in `src/`:

- **`src/ForgeSelect.ts`** — the whole component. One class that owns DOM construction, event binding, selection state, search/filtering, keyboard nav, virtual scrolling, and AJAX loading. There's no sub-component split; everything lives on `ForgeSelect` as private methods grouped by comment banners (`DOM setup`, `selection`, `rendering`, `remote data`).
- **`src/types.ts`** — all public option/data/event types (`ForgeSelectOptions`, `Option`, `OptionGroup`, `AjaxConfig`, `ForgeSelectPlugin`, etc).
- **`src/emitter.ts`** — minimal typed pub/sub (`on`/`off`/`emit`/`clear`) used internally for the public event API (`change`, `open`, `close`, `search`, `clear`).
- **`src/i18n.ts`** — `en`/`vi` string tables plus `{placeholder}`-style `format()` interpolation. `getStrings()` merges a custom string table over the `en` defaults when `language` is an object.
- **`src/index.ts`** — the only public entrypoint; re-exports `ForgeSelect` (default + named) and the public types. Anything not exported here is a private implementation detail.

Key internal concepts to know before touching `ForgeSelect.ts`:

- **Data model**: `data` is `DataItem[]`, where a `DataItem` is either a flat `Option` or an `OptionGroup` (`{ label, options }`). `isGroup()` distinguishes them. When mounted on a native `<select>`, `parseNativeOptions()` derives this shape from `<option>`/`<optgroup>` children instead of requiring the `data` config.
- **Rows vs. nav items**: `buildRows()` produces `Row[]` (everything rendered in the list — group headers, options, the "create" row, empty/loading states) and a parallel `NavItem[]` (only keyboard/click-selectable items: real options + the create row). A `Row`'s `navIndex` is its position in `navItems`, used for highlighting and `aria-activedescendant`. Keep this split in mind — group labels and disabled options are in `rows` but not in `navItems`.
- **Virtual scrolling**: kicks in automatically once `rows.length > VIRTUAL_THRESHOLD` (100), unless `virtualScroll: false`. `renderRows()` slices the visible window plus a `VIRTUAL_BUFFER` and pads with spacer `<li>`s to preserve scrollbar size. Rendered option content is memoized in `rowContentCache` (keyed by option value, FIFO-evicted at `ROW_CACHE_LIMIT`) and cloned per row so templates don't re-run every scroll frame — state (selected/highlighted/disabled) is applied to the `<li>` wrapper, not baked into the cached content.
- **AJAX**: `scheduleRemoteLoad()` debounces then calls `loadRemote()`, which tracks an incrementing `ajaxRequestId` so a stale in-flight response can't clobber a newer one (checked before applying `data` and again in the `finally`).
- **Native `<select>` sync**: when mounted on a real `<select>`, `syncNativeSelect()` keeps its `<option>`s' `selected` state in sync and dispatches a native `change` event, so ForgeSelect works transparently inside plain `<form>` submission.
- **Plugins**: `ForgeSelectPlugin` is a lifecycle-hook object (`onInit`/`onOpen`/`onClose`/`onDestroy`, all optional), invoked at the corresponding point in `open()`/`close()`/`destroy()`/the constructor. See `docs/plugin-development.md` for the authoring guide.
- **Rendering safety**: the built-in row/value renderer (`renderTemplate`) builds DOM via `textContent`/`createElement`, not `innerHTML`, so avatar/label/description fields are XSS-safe by construction. A custom `templateResult`/`templateSelection` returning a string _is_ inserted via `innerHTML` — that's the one place caller-supplied HTML is trusted as-is.

## Site / docs build

`scripts/build-site.mjs` assembles `_site/`, deployed to Cloudflare Workers (see `CONTRIBUTING.md` → "Deploying the site"): it copies `site/` (landing + playground) and `demo/` as-is, copies the built `dist/` and `styles/`, and renders each file listed in `docs/*.md` through a shared HTML layout (via `markdown-it` + `highlight.js`) into `_site/docs/`. If you add a new doc page under `docs/`, add a matching entry to the `DOCS` array in that script or it won't be published. Preview with `npm run build:site && cd _site && npx serve -l 8080`.

## Conventions

- Zero runtime dependencies — this is a hard constraint (see README/CONTRIBUTING). New dev dependencies are fine when justified; never add a runtime dependency.
- `tsconfig.json` has `strict`, `noUnusedLocals`, and `noUnusedParameters` on — expect typecheck to fail on unused bindings, not just type errors.
- Styling is CSS custom properties only (`styles/forge-select.css`), with `default` and `dark` themes selected via `data-theme` on the root element — no CSS-in-JS or build-time theming step.
- PRs should update the relevant page under `docs/` and add an entry to `CHANGELOG.md` under **Unreleased** for behavior changes (see `CONTRIBUTING.md`).
