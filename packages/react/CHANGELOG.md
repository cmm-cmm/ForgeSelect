# Changelog

All notable changes to `forge-select-react` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-07-21

### Added

- Controlled `open`/`searchQuery`, change callbacks, loading/invalid callbacks, and reactive runtime options.

### Fixed

- The reactive runtime-options sync no longer calls `updateOptions()` on every parent re-render. The rest-spread options object is a new reference each render regardless of content, which previously cleared render caches and could reset an open, non-virtualized dropdown's scroll position on unrelated re-renders; it's now gated behind a shallow value comparison.

## [0.3.0] - 2026-07-21

### Added

- `onSelect`, `onUnselect`, `onCreate`, `onReorder`, and `onMaximum` detail callbacks.

### Changed

- The `data` prop now updates the existing Forge Select instance without remounting it. Requires `forge-select` 0.4.0 or newer (bumped the `forge-select` dependency accordingly).

## [0.2.0] - 2026-07-21

### Added

- `onOpen`/`onClose`/`onSearch`/`onClear`/`onError` props, forwarding the full `ForgeSelectEvent` union instead of only `change`.

### Fixed

- Published tarballs now include the project MIT license.
- Controlled `value` updates no longer invoke `onChange`, and rerenders use the latest callback.

## [0.1.0] - 2026-07-14

### Added

- Initial release: `ForgeSelectReact` component wrapping the `forge-select` core library, with controlled `value`/`onChange` support.

[Unreleased]: https://github.com/cmm-cmm/ForgeSelect/compare/react-v0.4.0...HEAD
[0.4.0]: https://github.com/cmm-cmm/ForgeSelect/compare/react-v0.3.0...react-v0.4.0
[0.3.0]: https://github.com/cmm-cmm/ForgeSelect/compare/react-v0.2.0...react-v0.3.0
[0.2.0]: https://github.com/cmm-cmm/ForgeSelect/compare/react-v0.1.0...react-v0.2.0
[0.1.0]: https://github.com/cmm-cmm/ForgeSelect/releases/tag/react-v0.1.0
