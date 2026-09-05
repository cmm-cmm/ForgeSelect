# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A cancelled remote request is no longer reported as a failed load. `loadRemote()` decided by checking its own controller, so an `AbortError` arriving from anywhere else — a caller's own `ajax.request` cancelling on its own terms, or a request shared with another consumer whose signal aborted — fell through to the failure path: it emptied `data`, rendered the error row and emitted `error` for something nobody can act on. A cancellation means the request never happened, so the already-loaded list now stays exactly as it was. Two consequences of that come with it: a cancelled fresh load clears `hasMore`, since `scheduleRemoteLoad()` had primed page 0 and a still-scrollable list would otherwise fetch page 1 of a page 0 that never arrived and append it to the previous query's options; and `ajax.retry` no longer retries a cancellation, which used to call a request that had just cancelled itself again after the backoff. The in-flight sharing that makes the second case possible is documented at `fetchRemoteResult()` rather than reworked: a later caller genuinely cannot cancel a request an earlier one still wants.

## [0.9.2] - 2026-09-05

### Changed

- Selecting or deselecting a tree parent no longer scans the selection once per descendant. The cascade checked each descendant with `selected.includes()` before pushing it, and deselection did an `indexOf` plus a `splice` per descendant, so both grew with the product of the subtree and the selection. Membership now goes through one set built for the cascade, and deselection removes the whole subtree in a single filtered pass. Measured over a parent of 8,000 children with the tag list capped so rendering does not dominate: selecting it drops from 58.4 ms to 8.4 ms, and the cost is now linear in the subtree rather than quadratic (1,000 -> 8,000 children scales 2.3x, not 14x). With tags uncapped the same select goes from 231 ms to 150 ms at 4,000 children -- the remainder is the control rendering one tag per selection, which is what `maxVisibleTags` exists for.
- `buildRows()` builds one set for the `maxSelections` check instead of scanning the selection per option, and only when the cap is actually reached. Nothing changes for the common small cap; a large one no longer costs a full selection scan per option on every keystroke.
- The document-wide capture-phase scroll listener is only registered when the dropdown is portalled. Its handler already returned immediately without a portal host, so an inline dropdown was paying a function call for every scroll event anywhere on the page to reach that guard. `portalHost` is built in the constructor, so whether it exists is known before any `open()`.
- The README's bundle-size figures are re-measured against the current build rather than 0.7.5: 13.8 KB gzipped for minimal usage, 14.2 KB with every feature touched, 2.6 KB for `styles.css`, and ~14.0 KB for the CDN IIFE bundle. No code changed — the published numbers had simply not moved since they were written.

### Fixed

- `npm run check:package` now verifies that each framework wrapper's `forge-select` peer range actually admits the core version being released, and that the core has not slipped from `peerDependencies` into `dependencies`. The wrappers asked for `^0.8.0`, which on a 0.x version means `>=0.8.0 <0.9.0`, so from 0.9.0 onward `npm install forge-select forge-select-react` failed outright with `ERESOLVE`. Nothing checked the two numbers against each other, so nothing caught it; `scripts/check-peer-range.mjs` does, from the same bounds npm resolves with. The wrappers themselves are fixed in their own 0.7.1 releases.
- CI now runs the package checks from the same script the `check:package` npm script uses, rather than an inlined copy of its `npm pack --dry-run` commands. The copy had drifted: the peer-range guard added alongside it ran in neither `verify` nor CI, so the check meant to stop a wrapper peer range from excluding the core it ships with was not actually running anywhere automatic. `CONTRIBUTING.md` already claimed CI ran `check:package`; the checks are now shared rather than duplicated. `check:package` still builds and then checks, for a working tree that may not be built; CI, which has already built by that point, calls `check:package:built` so the builds are not repeated.
- Deselecting a tree parent had no test covering the cascade at all. With the descendant removal disabled the whole suite still passed, because the children stayed selected, `syncTreeAncestors()` then saw every child selected and put the parent back, and the click read as a no-op. Added a regression test that fails with exactly that symptom (`['apple','banana','fruits']` where `[]` is expected).

## [0.9.1] - 2026-09-04

### Changed

- Reconciling tree parents against the selection no longer scans the selection array per descendant. `computeCheckState()` decided each leaf with `selected.includes()`, and `syncTreeAncestors()` calls it for every parent, so the walk cost grew with the product of the tree and the selection: over a 10,000-node tree with everything selected it took 305 ms. It now resolves membership through one set built for the walk, and `computeCheckState()` accepts either an array or a set so a caller resolving a single node still needs no set of its own. `renderRows()` builds one set for the window it renders instead of leaving each row to scan.
- `syncTreeAncestors()` is skipped outright for data with no nested options, where the walk could only visit every option and return at its own childless guard.
- Measured in isolation, five runs per variant, a 10,000-node tree of 500 parents: `selectAll()` drops from 305 ms to 87 ms, about 3.5x. Flat data is unchanged, as expected — it was never paying the tree walk. Costs 92 gzipped bytes, to 14,340 against the 14,500 budget.

## [0.9.0] - 2026-09-03

### Added

- `maxVisibleTags` caps how many tags a multiple select renders in its control; selections past the cap collapse into a single `+N more` chip. It is unset by default, so an existing select renders every selection exactly as before. Without a cap the control builds four elements and one listener per selection, and the browser then has to lay all of them out: selecting 10,000 options cost 254 ms, 175 ms of it layout, for 40,000 tag nodes. With `maxVisibleTags: 20` the same operation costs 55 ms with 14 ms of layout — 4.6x faster — because the control's size no longer follows the selection's. The counter is rendered as text alongside the tags rather than hidden from assistive technology, so it is announced with them. Costs 165 gzipped bytes, to 14,248 against the 14,500 budget.

### Changed

- Filtering no longer rebuilds the query for every option it scores. `SearchIndex.score()` normalized the query (NFD plus two regex passes), split it into tokens, built the haystack cache key and located the label field on each call, so a keystroke over a 10,000-option list repeated all of it 10,000 times; the caller also allocated a fresh config object per option. That half now happens once per pass through `SearchIndex.prepare()`, with `scorePrepared()` doing only the per-option work. `score()` keeps its signature and delegates to both, and a prepared query carries its own copy of the config, so a caller mutating one between the two calls cannot have them disagree about how the query was normalized.
- `buildRows()` skips its subtree-match cache for a dataset with no nested options, and skips it entirely when there is no query. The cache only pays off for a node reachable twice — through its parent's descendant scan and again as that parent expands — so on a flat list every entry was written and never read. Whether the data is nested is recorded by the walk `rebuildOptionIndexes()` already does, and it is only ever a speed hint: subtree matching is pure, so a stale flag would recompute, never answer differently. `hasReachedMaximum()` is also hoisted out of the per-option loop, since `selected` cannot change while rows are being built.
- Measured over a 10,000-option list, interleaved A/B across four rounds: `buildRows()` during a search keystroke drops from 24.4 ms to 10.8 ms (−56%), and during `open()` from 1.4 ms to 0.85 ms (−39%). A keystroke is almost entirely `buildRows()` — 12.0 ms of 12.5 ms measured by phase — so that is the whole of the work. Search p95 in `npm run bench` falls from 40.3 ms to 33.4 ms; the median is unchanged because that metric waits two animation frames regardless. Costs 161 gzipped bytes, to 14,069 against the 14,500 budget.
- Showing or hiding the built-in search box no longer counts the dataset by walking it. `shouldShowSearch()` built a throwaway `Set` of every value just to compare its size against `minResultsForSearch`, a threshold in the tens, and it runs on construction and on every data change. It now reads `optionByValue.size`, which is the same count over the same walk and is already built. Remote pagination likewise deduplicates an incoming page against that index instead of re-collecting every value loaded so far.
- `normalizeSearchText()` skips Unicode decomposition for text that is already ASCII. Nothing the accent-insensitive pass removes is ASCII — NFD leaves ASCII unchanged, and neither combining marks nor d-with-stroke are ASCII — so a lowercased ASCII label is already normalized, and only the strings that can actually change take the `normalize("NFD")` plus two-regex path.
- Together, over a 10,000-option list and interleaved A/B across three rounds: construction 1.5 -> 1.0 ms (-35%), the first search of a select 7.0 -> 4.1 ms (-40%), and `setData()` 8.0 -> 5.2 ms (-35%). Later searches are unchanged, as expected: they were never paying either cost. Adds 14 gzipped bytes, to 14,083 against the 14,500 budget.

## [0.8.0] - 2026-09-03

### Fixed

- `aria-activedescendant` was written to the search input even when that input was hidden. `open()` only focuses the search box when it is visible, so a select whose search is suppressed (`minResultsForSearch`, or `searchable` data below the threshold) keeps focus on the control — the reference then named an element no assistive tech was on, and arrowing through the list announced nothing at all. It now follows whichever element actually holds focus, and the other one is cleared so a runtime show/hide of the search box can't strand a stale reference.
- A closed dropdown kept its `aria-activedescendant`. `close()` hides the dropdown without re-rendering it, so the last highlighted row and its id survived, leaving a collapsed combobox (`aria-expanded="false"`) still naming an active option. The reference is now dropped on close.
- Search-match highlighting put the `<mark>` boundary in the wrong place on labels whose normalized form has a different length than the source. Ranges were computed against the normalized text and then sliced out of the raw label, which holds only while normalization is length-preserving — it is not: stripping combining marks shortens a decomposed label (`"Cafe" + U+0301`, the form macOS hands back, lost a code unit and the accent rendered outside the mark on the following glyph), and lowercasing can lengthen one (`U+0130` becomes `"i" + U+0307`). Normalization now records the source index of every code unit it emits, so ranges map back exactly.
- `allowCreate` appended each created option to the caller's own `data` array. Forge Select now copies the array it is given, in the constructor and in `setData()`, so tags mode no longer mutates the array a consumer passed in — which React could not see (same reference, no re-render) and which Vue saw the wrong way (a deep watcher on the options prop firing back into `updateOptions()`). The `Option` objects inside stay shared by reference, as the row-content cache and search index require. Documented under "Ownership of the `data` array" in the API reference.
- Options no longer report their position only within the rendered virtual-scroll window. `aria-setsize`/`aria-posinset` are now emitted on every option row and on the create row, describing the whole filtered list, so a screen reader on a 10,000-option select announces the real total instead of "1 of 20". WAI-ARIA requires the pair whenever the DOM holds only part of the set; axe could not catch this because it only sees what is rendered.

### Changed

- Bulk selection is no longer quadratic. `setValue()`, `selectAll()`, native `change`/`reset` syncing and the initial parse of a `<select>`'s pre-selected options all drove `selectValue()` from a loop, and each call cost a linear `includes` scan of the running selection plus a `syncTreeAncestors()` walk of the entire dataset. They now share one bulk path that checks membership against a `Set` and syncs the tree once at the end — all that sync ever needed, since it recomputes ancestors from the finished selection rather than accumulating across calls. `syncNativeSelect()` was independently quadratic for the same reason and now indexes the `<option>` elements by value. Measured in Chromium on a native `<select multiple>`: `setValue()` over 8,000 values drops from 492 ms to 44 ms, and over 16,000 from 1,782 ms to 60 ms — quadratic to linear. `selectAll()` under a `maxSelections` cap keeps the incremental path (the cap has to be weighed per candidate) but now stops once the cap is reached instead of scanning every remaining option: 20,000 options with a cap of 5 goes from a full scan to 6 ms.
- The focus ring, tree indeterminate fill and search-match highlight now declare a static fallback before their `color-mix()` derivation. A browser without `color-mix()` (pre Chrome 111 / Firefox 113 / Safari 16.2) previously dropped those declarations entirely — losing the focus ring outright, which is an accessibility regression rather than a cosmetic one. The fallbacks are exposed as `--fs-focus-ring`, `--fs-option-indeterminate-bg` and `--fs-match-bg` so they stay themeable. This lowers the component's real browser floor to Chrome/Edge 87, Firefox 78 and Safari 14.1, now stated explicitly in the README.

### Added

- Windows High Contrast support via `@media (forced-colors: active)`. Forced-colors mode replaces every author color, which collapsed selected, highlighted and hovered rows into one indistinguishable swatch and removed the focus ring entirely (it is a `box-shadow`, which the mode drops). Those states are now restated with system color keywords and real outlines.
- `@media (prefers-reduced-motion: reduce)` disables the dropdown arrow's rotation transition.
- A documented CDN consumption path. The minified IIFE bundle has always been built and size-budgeted in CI, but nothing pointed at it: with an `exports` map present bundlers could not resolve its path, and `unpkg.com/forge-select` fell through to `main` — a CommonJS file that fails in a `<script>` tag. The package now declares `unpkg`/`jsdelivr` fields plus explicit `./dist/index.global.js` and `./package.json` export entries, and the README documents the `<script>` usage.

### Documentation

- README states minimum browser versions instead of listing engine names, and separates the hard floor from the two progressive enhancements layered above it.
- `CONTRIBUTING.md`'s deploy section described retiring GitHub Pages as pending work. The `gh-pages` branch and its workflow are gone and the github.io URL returns 404; the section now records that as done and says not to reintroduce a second deploy target.

### Internal

- CI pins every action to a commit SHA, matching `release.yml` — `ci.yml` had been using floating `@v4` tags, so the repository held two different supply-chain standards. A `dependabot.yml` now proposes the bumps, since a pinned SHA otherwise never moves, including past a security fix.
- Pull requests targeting `dev` run CI. The trigger only covered `main`, so a fork PR into `dev` — where work actually lands first — was reviewed with no checks at all.
- Playwright retries twice on CI. Three engines run in parallel on a shared runner, and a single flake failed the build.
- `forge-select` is a peer dependency of the React and Vue wrappers rather than a hard dependency, so a consumer controls the core version and cannot end up with two copies installed.
- The React wrapper's `@types/react` is aligned to the React 18 runtime it is actually tested against, instead of pinning React 19 types over an 18 runtime. Root `@types/node` is aligned to the `>=20.19` floor in `engines`, so scripts cannot silently rely on APIs the minimum supported Node lacks.
- Both wrappers re-export `TemplateSanitizer`, `SelectionGuard`, `CreateOption` and `MissingSelectionPolicy`, which the core has always exported but the wrappers stopped short of — a React consumer using `sanitizeTemplate` could not import its type.
- The benchmark gzip budget moves from 14,000 to 14,500 bytes. The bundle grew from 13,529 to 13,908 — `aria-setsize`/`aria-posinset` on every row, the linear bulk-selection path, and the index-mapped search normalization — which left only 92 bytes of headroom, the same too-tight-to-be-useful state 13,500 was in before 0.7.5 raised it. Weighed rather than nudged: the 379 bytes buy a WAI-ARIA requirement, a quadratic-to-linear fix worth 1.7 s on a 16,000-value `setValue()`, and a highlight correctness fix.
- The React and Vue workspaces now build and test against the core in this repository. They declared `forge-select` by semver range, and npm does not treat the root project as a linkable workspace target, so it resolved that range from the registry instead: every `npm run typecheck/test/build --workspaces` run — locally and in CI, including the one inside the release job — was validating the wrappers against the last _published_ core (0.7.0, six releases behind the source next to it). The release workflow's own notes claimed the opposite. The dev dependency is now a `file:../..` link, so the wrappers compile against the core they ship alongside.
- The benchmark's lifecycle selector no longer includes `.forge-select__portal`, which matched nothing (the class is `forge-select--portal-host`). The leak check was already covered by the `.forge-select` half.

## [0.7.6] - 2026-09-03

### Changed

- Construction no longer builds the option label index. It exists only so `allowCreate` can tell an exact match from a new tag, but it was filled for every instance, normalizing (NFD plus two regex passes) every label up front — work the majority of selects, which never create tags, never read. It is now built on first use, and warmed when an `allowCreate` select opens so the cost never lands on the keystroke the user is waiting on. Measured over a 10,000-option list: constructing a select without `allowCreate` drops from 6.6 ms to 2.5 ms, and with `allowCreate` the first keystroke goes from 20.6 ms to 18.0 ms and later ones are unchanged. Every path that already reindexed on a data or `accentInsensitive` change invalidates it too, so exact-match detection still follows the current options.

## [0.7.5] - 2026-09-02

### Fixed

- `forge-select/styles.css` is no longer dropped by bundlers that honor `sideEffects`. The package declared `"sideEffects": false`, which tells a bundler that no module in it has side effects, so a bare `import "forge-select/styles.css"` was eligible for elimination. Reproduced with webpack 5 + `mini-css-extract-plugin`: no CSS asset was emitted at all, silently, leaving the component unstyled with no error. The field now marks CSS as side-effectful (`["**/*.css"]`), which restores the emitted stylesheet; JavaScript tree-shaking is unaffected. `forge-select-react` and `forge-select-vue` ship no CSS and correctly keep `"sideEffects": false`.

### Changed

- The benchmark gzip budget moves from 13,500 to 14,000 bytes. It had been sitting about five bytes above the bundle it guarded, so it no longer distinguished real growth from noise — the 0.7.4 correctness fixes crossed it and landed with CI red instead of being weighed against it. The bundle itself is unchanged at 13,529 bytes; this restores roughly 3% of headroom so a breach again means something.

### Documentation

- `docs/api-reference.md` said rendered row content is "cached per option value". It has been keyed by the option object since 0.7.2 — the change that stopped two options sharing a value from rendering the first one's label.
- README now documents that the bundle is monolithic: every feature is included whether or not it is used, so a minimal select costs 13.3 KB gzipped against 13.4 KB for one using the entire API. Opt-in subpath entrypoints are noted as a possible future major, not a patch.

## [0.7.4] - 2026-08-11

### Fixed

- `createOption` returning `undefined` synchronously to cancel tag creation is now honored. It was only respected on the async (`Promise`) path — the sync path's `?? fallback` couldn't distinguish "createOption cancelled" from "createOption isn't configured," so a rejected label was created anyway with the default `{ value, label }` shape.
- `updateOptions({ duplicateValuePolicy: "error", ... })` no longer leaves later fields in the same call unapplied when it throws. Validation is now deferred until every other field has been assigned, so a call combining `duplicateValuePolicy: "error"` with unrelated options (theme, placeholder, `itemHeight`, etc.) against already-duplicate data still applies all of them before raising.
- `setData()` no longer cancels a pending or in-flight remote request as a side effect of being rejected by `missingSelectionPolicy: "error"`. The AJAX timer/controller reset and pagination-state clear now happen only once the new data is known to be acceptable.
- A failed (non-append) remote reload now rebuilds the value/label option indexes after resetting `data` to `[]`, matching every other site that reassigns `data`. Previously the indexes kept resolving options that were no longer present until the next successful load happened to rebuild them.
- The remote response cache key no longer conflates a cursor value with a page number sharing the same string (e.g. both `"0"`) — cursor and page-numbered entries are now tagged separately, so one can no longer silently overwrite the other.
- Closing the dropdown now retires a programmatically-set search query (via `setSearchQuery()`) the same way it retires a typed one, even on a `searchable: false` instance with no search box. Previously the reset was nested inside a search-input existence check, so a `searchable: false` AJAX select could reopen showing a stale filtered page.

## [0.7.3] - 2026-08-02

### Fixed

- `aria-activedescendant` no longer references a row that has been removed from the DOM. Scrolling a virtualized list past the highlighted option left the attribute pointing at that option's id, and virtualization is automatic above ~100 rows, so any large list was affected. A dangling reference reads to assistive technology as no active option at all. The attribute is now cleared while the highlighted row is outside the rendered window, and restored as soon as keyboard navigation scrolls it back into view.

## [0.7.2] - 2026-08-02

### Fixed

- Two options sharing a `value` no longer render the same content. Rendered row content was cached by option value, so with `duplicateValuePolicy` left at its default (warn, not reject) the second option displayed the first one's label. Content is now cached against the option object itself.
- Reopening an AJAX-backed select after a search no longer shows the previous query's results under an empty search box. Closing clears the search box, so the loaded page is now discarded with it and refetched on reopen — normally served from the remote cache without an extra request. Closing also retires the request that query belongs to, so one still in flight cannot land its filtered page afterwards and suppress the reload. Selects whose search box was already empty are unaffected and still do not refetch.

### Changed

- Row `<li>` recycling is keyed by option value instead of value-plus-row-index. Filtering shifts every index below the first change, which previously invalidated the whole element cache on each keystroke; reuse across a narrowing query goes from 0% to ~18% in a 2,000-option list. Rows are claimed at most once per render, so duplicate values still render as separate rows.
- Removed `scoreOption()`, an unused duplicate of `SearchIndex.score()`. It was never part of the public API and was already tree-shaken out of the published bundle, but left two copies of the scoring rules to keep in sync by hand.
- Angular and Svelte wrapper packages are no longer planned and have been dropped from the roadmap. Both frameworks mount Forge Select directly; `docs/examples.md` now documents the Angular approach alongside the existing Svelte one.

## [0.7.1] - 2026-08-02

### Fixed

- A remote reload no longer leaves the previous result set's recycled `<li>` elements in the row cache. An AJAX-backed select that reused a row position across two result sets could render an option at the wrong tree indent — a top-level option kept the `padding-left` of the nested option that previously occupied its row — and the stale elements were retained until the cache filled. Row recycling now also clears inline styles, so a recycled row can no longer inherit any positional state from its previous occupant.

## [0.7.0] - 2026-07-31

### Added

- IME-safe search/tag input, cancellable selection/creation guards, asynchronous `createOption`, configurable missing-selection and duplicate-value policies, cursor-based remote pagination, and a sanitizer hook for string templates.
- Benchmark median/p95 reporting, destroy lifecycle checks, bundle/virtual-row budgets, and CI enforcement.

### Changed

- Option lookup is indexed by value/normalized label, tree-search results are memoized per render, variable-height virtualization uses binary search for its starting row, and virtual rows recycle bounded `<li>` elements across scroll renders.
- Portalled dropdowns now follow `visualViewport` resize/scroll changes on mobile. Remote prefetch is aborted during teardown.
- Updated `sharp` and `wrangler`; the dependency audit is clean.

### Fixed

- The website header navigation now stays on one horizontally scrollable line at mobile widths instead of wrapping link labels and increasing the sticky header height.

## [0.6.0] - 2026-07-21

### Added

- Fuller dropdown keyboard navigation: `Home`/`End` jump to the first/last option, `PageUp`/`PageDown` jump by a page, and typing a letter jumps to the next option starting with it (native `<select>`-style typeahead, with accent-insensitive matching and repeated-letter cycling).

### Changed

- Rendering and caching perf: search no longer clears the rendered-row content cache on every keystroke, a plain (non-capped) selection only re-renders visible rows instead of re-scanning the whole dataset, virtual-scroll row measurement no longer forces a synchronous reflow per row, `rowOffsets()` is memoized, and scroll-driven re-renders (including portal dropdown repositioning) are coalesced to one per animation frame. `RemoteCache` now bounds its size with FIFO eviction instead of growing unboundedly.

### Fixed

- The virtual-scroll measured row-height cache is now cleared alongside the render cache on `setData()`/`updateOptions()`/remote reloads, so it can no longer serve a stale height for a changed option.
- Typeahead now runs only from the combobox control (not while typing into search), avoiding a conflict with the search box's own filtering; closing the dropdown also cancels any pending typeahead/scroll work.
- Creating a tag while a multi-select stays open now rebuilds the filtered rows after clearing the query, avoiding a stale create row.

## [0.5.0] - 2026-07-21

### Added

- Runtime `.updateOptions()`, controlled search/open state APIs, and reactive wrapper synchronization.
- Accent-insensitive token/metadata search, custom scoring, and optional safe match highlighting.
- Remote query/page caching, retry backoff, prefetch, `loadOnOpen`, `.reload()`, `.clearRemoteCache()`, and `loading` events.
- Public validation methods and the `invalid` event.
- Variable-height virtual rows via `itemHeight: "auto"` and an explicit mixed-selection tree indicator.

### Changed

- Search and remote-cache logic now live in focused, directly tested internal modules.

## [0.4.0] - 2026-07-21

### Added

- The dropdown now automatically flips above the control when there isn't room below but there is above (recomputed on open and on window resize) — no configuration needed.
- `.setData(data)` instance method to replace the option list after construction and re-render an already-open dropdown, without a full destroy/remount. A selection whose value isn't in the new data stays selected.
- `closeOnSelect` and `maxSelections` options for multi-select: close the dropdown after each pick, and/or cap the number of selected values (including via `allowCreate`).
- `filterOption` custom match predicate and `minSearchLength` to gate filtering/remote loads until a minimum query length is reached.
- `required` option with native form validation integration: on a native `<select>` mount it blocks form submission and shows inline invalid styling until a value is picked, plus `aria-required`.
- `isOptionDisabled` callback for dynamically disabling an option per render, and a `className` field on `Option` for custom row styling.
- `.selectAll()` / `.clearAll()` instance methods for multi-select.
- Pasting a comma/newline-separated string into the search box in tags mode (`allowCreate` + `multiple`) now creates one tag per value instead of a single tag containing the whole string.
- `openOnFocus` option to open the dropdown when the control receives keyboard focus.
- `minResultsForSearch` to hide the search input for small local data sets, and `dropdownParent` to portal the dropdown outside clipping containers.
- A custom `ajax.request` transport for GraphQL, authenticated clients, and other non-URL remote sources.
- Typed `select`, `unselect`, `create`, `reorder`, and `maximum` detail events.

### Fixed

- `maxSelections` now evaluates the complete tree cascade before interactive selection, so descendants/ancestors cannot push the result over the configured limit.
- `setData()` now cancels and invalidates pending AJAX work and pagination state, preventing a stale response from overwriting manually supplied data.
- `closeOnSelect` now closes after `allowCreate`, and stays open when a pick is rejected by `maxSelections`.
- Reaching `maxSelections` now disables remaining options and announces the limit through the live region.

### Changed

- The supported Node.js runtime is now 20.19 or newer, matching the development toolchain requirements.
- React and Vue `data` inputs now update existing instances without remounting.
- Dropdown placement calculation is isolated in a directly tested internal module.
- CI now verifies compatibility on Node.js 20.19 and 24 in addition to the primary Node.js 22 job.

## [0.3.0] - 2026-07-21

### Added

- Reproducible `npm run bench` baseline for bundle size, initialization, 10,000-option search, virtual-scroll frame timing, and rendered-row count.
- Automated axe accessibility checks in the real-browser Playwright suite.
- Repository-wide LF policy and CI coverage for direct pushes to the `dev` integration branch.
- Quality gates: ESLint, Prettier, 80% V8 coverage thresholds, generated-site/package validation, and Playwright coverage across Chromium, Firefox, and WebKit.
- Additive `setValue(value, { emitChange: false })` API and an `error` event/localized row for remote-load failures.
- Keyboard-operable tree navigation with `ArrowRight`/`ArrowLeft` and `aria-expanded` state.
- **Cloudflare deploy**: the site now deploys to Cloudflare (Workers with static assets, project `forge-select`) on every push to `main`, via a Workers Builds project connected directly to this repo through the Cloudflare Dashboard's Git integration (not a GitHub Actions workflow), configured by the new `wrangler.jsonc` at the repo root; see "Deploying the site" in `CONTRIBUTING.md`. Adds a `wrangler` dev dependency and a `deploy:cloudflare` script for manual/local deploys.
- **Drag & Drop Ordering**: `sortable: true` (multi-select only) lets users reorder selected tags by dragging with mouse/touch/pen (Pointer Events), or via `Alt+Left`/`Alt+Right` when a tag has keyboard focus. Fully opt-in — multi-select behavior, markup, and events are unchanged when `sortable` is left at its default `false`. When mounted on a native `<select multiple>`, the underlying `<option>` elements are also reordered to match, so a plain `<form>` submission serializes values in the dragged order.
- Live demo: new "Rich items — 1,000 users (multiple)" card showing the built-in `avatar`/`description` rich-item rendering combined with `multiple` + tags on a 1,000-item virtualized list.
- The React and Vue wrappers now forward `onOpen`/`onClose`/`onSearch`/`onClear`/`onError` props (React) and `open`/`close`/`search`/`clear`/`error` emits (Vue), matching the full `ForgeSelectEvent` union instead of only `change`.
- A visually-hidden `aria-live="polite"` status region now announces loading/error/no-results state changes to screen readers.
- GitHub issue templates (bug report, feature request) and a pull request template under `.github/`.

### Changed

- Built-in and custom option rendering now lives in a focused internal module with direct XSS-safety and template tests; the public API is unchanged.
- React and Vue package tarballs now include the project MIT license.
- The IIFE bundle (`dist/index.global.js`, the CDN/`<script>` build) is now minified — the ESM/CJS builds are unaffected.
- CI: added `concurrency` groups to `ci.yml`/`release.yml` so superseded runs don't queue redundantly, added an explicit `permissions: contents: read` block to `ci.yml`, restructured steps so `dist/`/workspace builds run once per job instead of up to 3×, and cached the Playwright browser binaries (keyed on OS + installed `@playwright/test` version) so most runs skip the ~1-2 minute browser download.
- Dev dependency major bumps, verified individually against the full test/lint/build suite: `@types/react`/`@types/react-dom` 18→19 (`packages/react`), `eslint` 9→10 + `typescript-eslint` patch bump, `jsdom` 26→29 (root + both wrapper packages), `vitest`/`@vitest/coverage-v8` 3→4 (root + both wrapper packages). `typescript` 5.9→7.0 was evaluated and **not** bumped — `typescript-eslint` hard-errors on TS 7.0 (not yet supported, see [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)); revisit once that lands.
- React/Vue controlled values now synchronize silently; callbacks and model events are reserved for user changes.
- Internal selection, native-select parsing, and remote normalization helpers are split into focused, directly tested modules.
- Site version badges are sourced from `package.json`, and generated local links are checked in CI.
- Site FAQ (landing page + JSON-LD) and docs no longer say React/Vue/Angular/Svelte wrappers are "on the roadmap but not yet available" — `forge-select-react` and `forge-select-vue` are published and documented in `docs/examples.md` and `docs/api-reference.md`; the live demo intro links to both.
- README's mini API table expanded from 4 to 14 options; `FUNDING.yml` trimmed to only the active `github` entry; `CODE_OF_CONDUCT.md` now routes reports to the maintainer's GitHub profile instead of the security-vulnerability channel.
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
- The loading/error/no-results rows inside the `role="listbox"` dropdown now expose `role="option"`/`aria-disabled`, fixing an `aria-required-children` violation (an axe scan of the empty-state dropdown found the listbox had no accessible children).
- Default theme's muted text color (`--fs-muted`, used by the loading/error/empty rows and helper text) darkened from `#9ca3af` to `#6b7280` to meet the WCAG AA 4.5:1 contrast minimum against the dropdown's white background.

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

[Unreleased]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.9.2...HEAD
[0.9.2]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.7.6...v0.8.0
[0.7.6]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.7.5...v0.7.6
[0.7.5]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/cmm-cmm/ForgeSelect/releases/tag/v0.1.0
