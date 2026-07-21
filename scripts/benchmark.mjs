import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(root, "dist/index.global.js");
const stylePath = path.join(root, "styles/forge-select.css");
const bundle = await readFile(bundlePath);
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  await page.setContent('<div id="single"></div><div id="many"></div><div id="search"></div><div id="scroll"></div>');
  await page.addStyleTag({ path: stylePath });
  await page.addScriptTag({ path: bundlePath });

  const timings = await page.evaluate(async () => {
    const ForgeSelect = window.ForgeSelectBundle.default;
    const options = Array.from({ length: 10_000 }, (_, index) => ({
      value: String(index),
      label: `Item ${index}`,
    }));
    const measure = (operation) => {
      const start = performance.now();
      operation();
      return performance.now() - start;
    };

    const initOneMs = measure(() => new ForgeSelect("#single", { data: options }));
    const many = document.querySelector("#many");
    const initFiftyMs = measure(() => {
      for (let index = 0; index < 50; index += 1) {
        const mount = document.createElement("div");
        many.append(mount);
        new ForgeSelect(mount, { data: options.slice(0, 100) });
      }
    });

    const search = new ForgeSelect("#search", { data: options });
    search.open();
    const input = document.querySelector("#search + .forge-select .forge-select__search");
    const searchStart = performance.now();
    input.value = "Item 9999";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const searchTenThousandMs = performance.now() - searchStart;

    const scroll = new ForgeSelect("#scroll", { data: options });
    scroll.open();
    const list = document.querySelector("#scroll + .forge-select .forge-select__list");
    const frameTimes = [];
    let previous = performance.now();
    for (let frame = 1; frame <= 30; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      frameTimes.push(now - previous);
      previous = now;
      list.scrollTop = (list.scrollHeight - list.clientHeight) * (frame / 30);
      list.dispatchEvent(new Event("scroll"));
    }

    return {
      initOneMs,
      initFiftyMs,
      searchTenThousandMs,
      scrollMeanFrameMs: frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length,
      renderedRowsAtTenThousand: list.querySelectorAll(".forge-select__option").length,
    };
  });

  const round = (value) => Math.round(value * 100) / 100;
  const result = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      browser: await browser.version(),
      platform: `${process.platform}-${process.arch}`,
      headless: true,
    },
    bundle: {
      minifiedBytes: bundle.byteLength,
      minifiedGzipBytes: gzipSync(bundle).byteLength,
    },
    timings: Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, round(value)])),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
}
