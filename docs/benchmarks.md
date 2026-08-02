# Benchmarks

> [Docs home](./README.md)
>
> **Status: reproducible baseline available.** Run the included benchmark on the target machine before comparing releases. Timing values depend on hardware and browser load; bundle-size values are deterministic.

## Methodology

The current baseline measures Forge Select itself so release-to-release regressions can be detected without pulling third-party code into the zero-dependency repository:

- **Bundle size** — minified and minified+gzip, zero-dependency build.
- **Initialization time** — median/p95 across seven 10,000-option instances, and total time for 50 smaller instances.
- **Search latency** — median/p95 from input to filtered render across seven queries over 10,000 options.
- **Scroll performance** — mean frame interval while scrolling a virtualized 10,000-option list.
- **Rendered row count** — verifies that a 10,000-option list stays virtualized.
- **Lifecycle cleanup** — verifies that create/open/destroy leaves no Forge Select DOM behind.

## Results

`npm run bench` prints machine-readable JSON containing:

| Metric                             | JSON field                          | Interpretation                          |
| ---------------------------------- | ----------------------------------- | --------------------------------------- |
| Minified bundle size               | `bundle.minifiedBytes`              | CDN/IIFE output before gzip.            |
| Minified+gzip bundle size          | `bundle.minifiedGzipBytes`          | Transfer-size approximation.            |
| Init time (1 × 10,000-option list) | `timings.initOneMs`                 | Constructor duration.                   |
| Init p95 (10,000-option list)      | `timings.initOneP95Ms`              | Slow-tail constructor duration.         |
| Init time (50 × 100-option lists)  | `timings.initFiftyMs`               | Multi-instance constructor duration.    |
| Search latency (10,000 options)    | `timings.searchTenThousandMs`       | Input event through two painted frames. |
| Search latency p95                 | `timings.searchTenThousandP95Ms`    | Slow-tail search duration.              |
| Mean virtual-scroll frame interval | `timings.scrollMeanFrameMs`         | Lower is better; ~16.7 ms is 60 fps.    |
| Rows rendered after virtualization | `timings.renderedRowsAtTenThousand` | Must remain well below 10,000.          |
| Residual DOM after destroy         | `timings.residualNodesAfterDestroy` | Must remain zero.                       |

## Running benchmarks locally

```bash
npm install
npm run bench
```

The command fails when the deterministic gzip/row/lifecycle budgets included in its JSON are exceeded. Record the reported Node, Chromium, platform, and headless fields alongside timing comparisons.

## See also

- [Playground](./playground.md)
- [API Reference](./api-reference.md)
