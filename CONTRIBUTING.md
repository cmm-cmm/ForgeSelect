# Contributing to ForgeSelect

Thanks for your interest in contributing! This guide covers everything you need to get productive.

## Development setup

```bash
git clone https://github.com/cmm-cmm/ForgeSelect.git
cd ForgeSelect
npm install
```

| Command | What it does |
| --- | --- |
| `npm test` | Run the vitest + jsdom test suite |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | Strict TypeScript check (`tsc --noEmit`) |
| `npm run build` | Build ESM + CJS + IIFE bundles and `.d.ts` into `dist/` |
| `npm run build:site` | Build the library plus the full website into `_site/` |

To preview the website/demo/playground locally:

```bash
npm run build:site
cd _site && python3 -m http.server 8080   # or: npx serve -l 8080
```

## Project layout

- `src/` — library source (strict TypeScript, zero runtime dependencies)
- `styles/forge-select.css` — the component stylesheet (CSS variables, default + dark themes)
- `tests/` — vitest + jsdom unit tests
- `docs/` — markdown documentation, rendered to the website by `scripts/build-site.mjs`
- `demo/`, `site/` — feature demo, landing page, and playground
- `.github/workflows/` — CI (typecheck/test/build) and GitHub Pages deployment

## Pull request guidelines

1. Branch from `main` and keep PRs focused on one change.
2. `npm run typecheck && npm test && npm run build` must pass — CI enforces all three.
3. Add or update tests for behavior changes; jsdom cannot model layout (e.g. `scrollTop` clamping), so verify scroll/visual behavior in a real browser too.
4. Update the relevant docs page under `docs/` and add an entry to `CHANGELOG.md` under **Unreleased**.
5. Keep the zero-dependency promise: no new runtime dependencies. Dev dependencies are fine when justified.

## Reporting bugs & requesting features

Open a [GitHub issue](https://github.com/cmm-cmm/ForgeSelect/issues) with a minimal reproduction — a snippet that runs in the [playground](https://cmm-cmm.github.io/ForgeSelect/playground/) is perfect.

For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
