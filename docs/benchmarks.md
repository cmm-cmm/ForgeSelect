# Benchmarks

> [Docs home](./README.md)
>
> **Status: reproducible baseline available.** Run the included benchmark on the target machine before comparing releases. Timing values depend on hardware and browser load; bundle-size values are deterministic.

## Methodology

The current baseline measures Forge Select itself so release-to-release regressions can be detected without pulling third-party code into the zero-dependency repository:

- **Bundle size** — minified and minified+gzip, zero-dependency build.
- **Initialization time** — time to first render for a single instance, and for 50 instances on one page.
- **Search latency** — time from keystroke to filtered list render, at 100 / 1,000 / 10,000 options.
- **Scroll performance** — frame time while scrolling a large option list, with and without `virtualScroll`.
- **Rendered row count** — verifies that a 10,000-option list stays virtualized.

## Results

`npm run bench` prints machine-readable JSON containing:

| Metric                             | JSON field                          | Interpretation                          |
| ---------------------------------- | ----------------------------------- | --------------------------------------- |
| Minified bundle size               | `bundle.minifiedBytes`              | CDN/IIFE output before gzip.            |
| Minified+gzip bundle size          | `bundle.minifiedGzipBytes`          | Transfer-size approximation.            |
| Init time (1 × 10,000-option list) | `timings.initOneMs`                 | Constructor duration.                   |
| Init time (50 × 100-option lists)  | `timings.initFiftyMs`               | Multi-instance constructor duration.    |
| Search latency (10,000 options)    | `timings.searchTenThousandMs`       | Input event through two painted frames. |
| Mean virtual-scroll frame interval | `timings.scrollMeanFrameMs`         | Lower is better; ~16.7 ms is 60 fps.    |
| Rows rendered after virtualization | `timings.renderedRowsAtTenThousand` | Must remain well below 10,000.          |

## Running benchmarks locally

```bash
npm install
npm run bench
```

Redirect stdout to retain a result for comparison, and record the reported Node, Chromium, platform, and headless fields alongside every result. Run at least three times on an otherwise idle machine and compare medians.

## See also

- [Playground](./playground.md)
- [API Reference](./api-reference.md)
