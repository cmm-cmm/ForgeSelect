# Changelog

All notable changes to `forge-select-vue` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.1] - 2026-09-05

### Fixed

- The `forge-select` peer range no longer excludes the core it is meant to be used with. It asked for `^0.8.0`, which on a 0.x version means `>=0.8.0 <0.9.0`, so once the core reached 0.9.0 `npm install forge-select forge-select-vue` failed outright with `ERESOLVE` rather than resolving. The range is now `>=0.8.0 <1.0.0`: the wrapper only uses the default export and the public option and value types, and both the type check and this package's tests pass against core 0.9.1, so every 0.x from 0.8 up is admitted. `npm run check:package` now verifies that the declared range actually admits the core version being released, which is the check whose absence let the mismatch ship.

## [0.7.0] - 2026-09-03

### Changed

- `forge-select` is now a **peer dependency** instead of a regular dependency. A wrapper that depends on the core directly can end up installed alongside a second, different copy of it whenever the consuming app pins a version outside the wrapper's range — two `ForgeSelect` classes, two sets of module state. Declaring it as a peer hands that choice to the app and guarantees a single copy. npm 7+ installs peer dependencies automatically, so most projects need no change; pnpm and strict-mode Yarn will now require `forge-select` to be listed in the app's own dependencies. Requires `forge-select` 0.8.x.

### Added

- `TemplateSanitizer`, `SelectionGuard`, `CreateOption` and `MissingSelectionPolicy` are re-exported. The core has always exported them, but the wrapper's type re-export list stopped short, so a consumer passing `sanitizeTemplate` or `beforeSelect` through the typed options surface had no way to import the matching type from this package.

## [0.6.0] - 2026-08-02

### Added

- New core options for selection guards, async tag creation, template sanitization, data-integrity policies, and cursor pagination are available through the existing typed options surface. Requires `forge-select` 0.7.x (bumped the `forge-select` dependency accordingly).

## [0.5.0] - 2026-07-21

### Added

- `ForgeSelectVue` now `expose()`s the underlying `ForgeSelect` instance through a template ref (e.g. `selectRef.value.selectAll()`, `.reload()`, `.validate()`), for the methods the declarative prop surface doesn't cover. Requires `forge-select` 0.6.0 or newer (bumped the `forge-select` dependency accordingly).

## [0.4.0] - 2026-07-21

### Added

- Controlled `open`/`searchQuery` bindings, loading/invalid events, and reactive runtime options.

## [0.3.0] - 2026-07-21

### Added

- `select`, `unselect`, `create`, `reorder`, and `maximum` detail events.

### Changed

- Changes to `options.data` now update the existing Forge Select instance without remounting it. Requires `forge-select` 0.4.0 or newer (bumped the `forge-select` dependency accordingly).

## [0.2.0] - 2026-07-21

### Added

- `open`/`close`/`search`/`clear`/`error` emits, forwarding the full `ForgeSelectEvent` union instead of only `change`.

### Fixed

- Published tarballs now include the project MIT license.
- Controlled `modelValue` updates no longer emit `update:modelValue` or `change`.

## [0.1.0] - 2026-07-14

### Added

- Initial release: `ForgeSelectVue` component wrapping the `forge-select` core library, with `v-model` support via `modelValue`/`update:modelValue`.

[Unreleased]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.7.1...HEAD
[0.7.1]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.7.0...vue-v0.7.1
[0.7.0]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.6.0...vue-v0.7.0
[0.6.0]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.5.0...vue-v0.6.0
[0.5.0]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.4.0...vue-v0.5.0
[0.4.0]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.3.0...vue-v0.4.0
[0.3.0]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.2.0...vue-v0.3.0
[0.2.0]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.1.0...vue-v0.2.0
[0.1.0]: https://github.com/cmm-cmm/ForgeSelect/releases/tag/vue-v0.1.0
