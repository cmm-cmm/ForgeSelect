# Changelog

All notable changes to `forge-select-react` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-21

### Added

- `onOpen`/`onClose`/`onSearch`/`onClear`/`onError` props, forwarding the full `ForgeSelectEvent` union instead of only `change`.

### Fixed

- Published tarballs now include the project MIT license.
- Controlled `value` updates no longer invoke `onChange`, and rerenders use the latest callback.

## [0.1.0] - 2026-07-14

### Added

- Initial release: `ForgeSelectReact` component wrapping the `forge-select` core library, with controlled `value`/`onChange` support.

[Unreleased]: https://github.com/cmm-cmm/ForgeSelect/compare/react-v0.2.0...HEAD
[0.2.0]: https://github.com/cmm-cmm/ForgeSelect/compare/react-v0.1.0...react-v0.2.0
[0.1.0]: https://github.com/cmm-cmm/ForgeSelect/releases/tag/react-v0.1.0
