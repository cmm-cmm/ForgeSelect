# Repository Guidelines

## Project Structure & Module Organization

Core TypeScript lives in `src/`; its public entry point is `src/index.ts`. Component styling is in `styles/forge-select.css`, and core tests are in `tests/`. Framework adapters are workspaces under `packages/react/` and `packages/vue/`, each with its own source, tests, and build configuration. Documentation is stored in `docs/`; `demo/` and `site/` contain browser demos and assets. `scripts/build-site.mjs` assembles `_site/`. Treat `dist/` and `_site/` as build outputs.

## Build, Test, and Development Commands

Use Node.js 18 or newer and install dependencies with `npm install`.

- `npm run typecheck` — run strict TypeScript checks without emitting files.
- `npm test` — run core Vitest tests once in jsdom.
- `npm run test:watch` — rerun affected tests during development.
- `npm run build` — create ESM, CJS, IIFE, and declaration outputs in `dist/`.
- `npm run build:site` — build the library and assemble the documentation site.
- `npm test --workspaces` — test the React and Vue workspace packages.

Before submitting, run `npm run verify` (lint, format check, typecheck, coverage-enforced tests, build) — CI additionally runs the workspace builds, `check:site`, `check:package`, `npm audit`, and the Playwright browser suite. Preview `_site/` with a local static server.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, double quotes, semicolons, trailing commas in multiline structures, and ES modules. The compiler enforces strict typing, unused-code checks, and consistent filename casing. Use `PascalCase` for classes and components (`ForgeSelect`), `camelCase` for functions and variables, and descriptive exported type names. Preserve the core package's zero-runtime-dependency policy. Keep CSS selectors under the established `forge-select` naming scheme and reuse CSS custom properties for theming.

## Testing Guidelines

Vitest with jsdom is the test framework. Name core tests `tests/*.test.ts`; wrapper tests use `packages/*/tests/*.test.ts` or `.test.tsx`. Add focused regression tests for behavior changes. Because jsdom does not model layout accurately, verify scrolling and visual behavior in a real browser using the demo or playground. `vitest.config.ts` enforces an 80% coverage threshold (lines/branches/functions/statements) via `npm run test:coverage`, which CI runs on every push — changed behavior needs a matching test, not just an assertion that it "should be exercised."

## Commit & Pull Request Guidelines

Recent commits use short, imperative, sentence-case subjects, such as `Add Drag & Drop Ordering for multi-select tags`. Keep each commit and PR focused. PRs should explain the change and motivation, link relevant issues, and include screenshots or recordings for UI changes. Update relevant files in `docs/` and add an entry under `Unreleased` in the appropriate `CHANGELOG.md`. Confirm typecheck, tests, and builds pass before requesting review. Report vulnerabilities through `SECURITY.md`, not public issues.
