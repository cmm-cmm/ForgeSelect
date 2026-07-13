# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Website rebranded with a green accent palette and a cursor logo/favicon across all pages.

### Added

- `CHANGELOG.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1).
- `.github/workflows/release.yml`: publishes to npm with provenance on `vX.Y.Z` tags (or manual dispatch), gated on typecheck/test/build and a tag/version match check.
- `homepage`, `bugs`, `engines`, and `publishConfig` fields in `package.json`; `prepublishOnly` runs the full verification suite before any publish.

### Fixed

- Playground stylesheet order so site accent overrides apply to ForgeSelect widgets.

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

[Unreleased]: https://github.com/cmm-cmm/ForgeSelect/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cmm-cmm/ForgeSelect/releases/tag/v0.1.0
