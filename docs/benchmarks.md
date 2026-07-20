# Benchmarks

> [Docs home](./README.md)
>
> **Status: planned.** Forge Select has no published release yet, so there are no real numbers to report. This page defines the methodology and the exact shape the results will be published in, so contributors can run and submit benchmarks as the library matures.

## Methodology

Benchmarks will compare Forge Select against Select2 (and, where relevant, other popular alternatives) on:

- **Bundle size** — minified and minified+gzip, zero-dependency build.
- **Initialization time** — time to first render for a single instance, and for 50 instances on one page.
- **Search latency** — time from keystroke to filtered list render, at 100 / 1,000 / 10,000 options.
- **Scroll performance** — frame time while scrolling a large option list, with and without `virtualScroll`.
- **Memory footprint** — heap usage after mounting and destroying N instances.

## Planned results table

Once a release exists, results will be recorded here in this format:

| Metric                                | Select2 | Forge Select | Notes                                |
| ------------------------------------- | ------- | ------------ | ------------------------------------ |
| Bundle size (min+gzip)                | _TBD_   | _TBD_        | Zero-dependency vs. requires jQuery. |
| Init time (1 instance)                | _TBD_   | _TBD_        | Cold render, ms.                     |
| Init time (50 instances)              | _TBD_   | _TBD_        | Cold render, ms.                     |
| Search latency (10,000 options)       | _TBD_   | _TBD_        | Keystroke to render, ms.             |
| Scroll frame time (10,000 options)    | _TBD_   | _TBD_        | With `virtualScroll: true`.          |
| Memory after 100 mount/destroy cycles | _TBD_   | _TBD_        | Heap delta, MB.                      |

## Running benchmarks locally (once available)

```bash
npm install
npm run bench
```

Results will be produced as JSON under `bench/results/` and summarized into the table above on each tagged release.

## See also

- [Playground](./playground.md)
- [API Reference](./api-reference.md)
