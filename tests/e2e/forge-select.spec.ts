import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";

const bundlePath = path.resolve("dist/index.global.js");
const stylePath = path.resolve("styles/forge-select.css");

interface BrowserForgeSelect {
  destroy(): void;
  getValue(): string | string[] | null;
}

type BrowserForgeSelectConstructor = new (
  target: string | HTMLElement,
  options?: Record<string, unknown>,
) => BrowserForgeSelect;

declare global {
  interface Window {
    ForgeSelectBundle: { default: BrowserForgeSelectConstructor };
    testSelect?: BrowserForgeSelect;
  }
}

async function loadForgeSelect(page: import("@playwright/test").Page, markup = '<select id="target"></select>') {
  await page.setContent(markup);
  await page.addStyleTag({ path: stylePath });
  await page.addScriptTag({ path: bundlePath });
}

test("has no automatically detectable accessibility violations", async ({ page }) => {
  await loadForgeSelect(
    page,
    '<label for="target">Country</label><select id="target"><option>Vietnam</option></select>',
  );
  await page.evaluate(() => {
    const ForgeSelect = window.ForgeSelectBundle.default;
    new ForgeSelect("#target", {
      clearable: true,
      data: [
        { value: "vn", label: "Vietnam" },
        { value: "th", label: "Thailand" },
      ],
    });
  });
  await page.locator(".forge-select__control").click();

  const results = await new AxeBuilder({ page }).include(".forge-select").analyze();
  expect(results.violations).toEqual([]);
});

test("supports tree keyboard navigation and exposes expansion state", async ({ page }) => {
  await loadForgeSelect(page);
  await page.evaluate(() => {
    const ForgeSelect = window.ForgeSelectBundle.default;
    new ForgeSelect("#target", {
      data: [{ value: "fruit", label: "Fruit", children: [{ value: "apple", label: "Apple" }] }],
    });
  });
  await page.locator(".forge-select__control").click();
  const search = page.locator(".forge-select__search");
  await search.press("ArrowDown");
  await expect(page.locator('.forge-select__option[aria-expanded="false"]')).toHaveCount(1);
  await search.press("ArrowRight");
  await expect(page.locator('.forge-select__option[aria-expanded="true"]')).toHaveCount(1);
  await search.press("ArrowRight");
  await expect(page.locator(".forge-select__option--highlighted")).toContainText("Apple");
  await search.press("ArrowLeft");
  await expect(page.locator(".forge-select__option--highlighted")).toContainText("Fruit");
});

test("virtualizes a large list while preserving keyboard selection", async ({ page }) => {
  await loadForgeSelect(page);
  await page.evaluate(() => {
    const ForgeSelect = window.ForgeSelectBundle.default;
    new ForgeSelect("#target", {
      data: Array.from({ length: 1000 }, (_, index) => ({ value: String(index), label: `Item ${index}` })),
    });
  });
  await page.locator(".forge-select__control").click();
  expect(await page.locator(".forge-select__option").count()).toBeLessThan(100);
  await page.locator(".forge-select__search").press("ArrowDown");
  await page.locator(".forge-select__search").press("Enter");
  await expect(page.locator(".forge-select__single-value")).toHaveText("Item 0");
});

test("restores the native element exactly on destroy", async ({ page }) => {
  await loadForgeSelect(page, '<select id="target" disabled style="display:inline-block"><option>A</option></select>');
  const state = await page.evaluate(() => {
    const ForgeSelect = window.ForgeSelectBundle.default;
    const instance = new ForgeSelect("#target");
    instance.destroy();
    const target = document.querySelector<HTMLSelectElement>("#target")!;
    return { display: target.style.display, disabled: target.disabled };
  });
  expect(state).toEqual({ display: "inline-block", disabled: true });
});

test("reorders sortable tags with pointer input", async ({ page }) => {
  await loadForgeSelect(page);
  await page.evaluate(() => {
    const ForgeSelect = window.ForgeSelectBundle.default;
    const instance = new ForgeSelect("#target", {
      multiple: true,
      sortable: true,
      data: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
        { value: "c", label: "Gamma" },
      ],
    });
    window.testSelect = instance;
  });
  await page.locator(".forge-select__control").click();
  await page.locator(".forge-select__option").nth(0).click();
  await page.locator(".forge-select__option").nth(1).click();
  await page.locator(".forge-select__option").nth(2).click();
  const first = page.locator(".forge-select__tag").first();
  const last = page.locator(".forge-select__tag").last();
  const from = await first.boundingBox();
  const to = await last.boundingBox();
  if (!from || !to) throw new Error("Sortable tag geometry was unavailable");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
  const value = await page.evaluate(() => window.testSelect?.getValue());
  expect(value).toEqual(["b", "c", "a"]);
});
