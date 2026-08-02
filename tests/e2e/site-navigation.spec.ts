import { expect, test } from "@playwright/test";
import path from "node:path";

const siteStylePath = path.resolve("site/assets/site.css");

test("keeps the website navigation on one line at mobile widths", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.setContent(`
    <header class="site-header">
      <a class="site-logo" href="#">
        <span class="mark"></span>
        Forge Select
        <span class="version">v0.6.0</span>
      </a>
      <nav class="site-nav" aria-label="Primary">
        <a href="#">Live Demo</a>
        <a href="#">Docs</a>
        <a href="#">Playground</a>
        <a href="#">Theme Builder</a>
        <a href="#">GitHub</a>
        <a href="#">npm</a>
      </nav>
      <button class="theme-toggle" type="button">🌙 Dark mode</button>
    </header>
  `);
  await page.addStyleTag({ path: siteStylePath });

  const header = page.locator(".site-header");
  const navigation = page.locator(".site-nav");
  await expect(header).toHaveCSS("height", "60px");
  await expect(page.locator(".site-logo .version")).toBeHidden();

  const geometry = await navigation.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(40);

  for (const link of await navigation.locator("a").all()) {
    await expect(link).toHaveCSS("white-space", "nowrap");
  }
});
