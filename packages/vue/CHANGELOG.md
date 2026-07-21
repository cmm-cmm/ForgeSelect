# Changelog

All notable changes to `forge-select-vue` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.4.0...HEAD
[0.4.0]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.3.0...vue-v0.4.0
[0.3.0]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.2.0...vue-v0.3.0
[0.2.0]: https://github.com/cmm-cmm/ForgeSelect/compare/vue-v0.1.0...vue-v0.2.0
[0.1.0]: https://github.com/cmm-cmm/ForgeSelect/releases/tag/vue-v0.1.0
