/**
 * Assembles the site into _site/ (deployed to Cloudflare Workers, see CONTRIBUTING.md):
 *   /            landing page (site/index.html)
 *   /demo/       interactive demo (demo/)
 *   /docs/       docs/*.md rendered to HTML with a shared layout
 *   /playground/ live code playground (site/playground/)
 *   /dist/ /styles/  library bundles + stylesheet used by demo/playground
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "_site");

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const SITE_URL = pkg.homepage.endsWith("/") ? pkg.homepage : `${pkg.homepage}/`;

const DOCS = [
  {
    file: "docs/README.md",
    slug: "index",
    title: "Introduction",
    description: "Forge Select docs home: what it is, installation, quick start, and links to every guide.",
  },
  {
    file: "docs/api-reference.md",
    slug: "api-reference",
    title: "API Reference",
    description: "Full Forge Select constructor, options, instance methods, and event reference.",
  },
  {
    file: "docs/examples.md",
    slug: "examples",
    title: "Examples",
    description: "Copy-pasteable Forge Select code snippets for single/multi select, tags, AJAX, templates, and more.",
  },
  {
    file: "docs/playground.md",
    slug: "playground",
    title: "Playground",
    description: "How to use the live Forge Select playground and demo to try every feature in the browser.",
  },
  {
    file: "docs/migration-from-select2.md",
    slug: "migration-from-select2",
    title: "Migration from Select2",
    description:
      "Option, event, and method mapping plus a step-by-step guide for migrating from Select2 to Forge Select.",
  },
  {
    file: "docs/benchmarks.md",
    slug: "benchmarks",
    title: "Benchmarks",
    description: "Planned performance benchmarking methodology comparing Forge Select to Select2.",
  },
  {
    file: "docs/plugin-development.md",
    slug: "plugin-development",
    title: "Plugin Development",
    description: "How to write and register custom Forge Select plugins using lifecycle hooks.",
  },
  {
    file: "CHANGELOG.md",
    slug: "changelog",
    title: "Changelog",
    description:
      "Release history and notable changes for Forge Select, following Keep a Changelog and Semantic Versioning.",
  },
];

// site/index.html, demo/index.html, and site/playground/index.html are copied
// verbatim (not rendered through layout()), so their <head> metadata lives by
// hand in each file. This array is only the sitemap/robots/llms.txt source of
// truth for those 3 pages; keep it in sync with the hand-written meta tags.
const STATIC_PAGES = [
  {
    path: "",
    title: "Forge Select — A modern, lightweight replacement for Select2",
    description:
      "Forge Select is a zero-dependency, accessible, high-performance select component with rich items, virtual scrolling, tags, AJAX, tree select, drag-and-drop tag ordering, and a plugin architecture.",
    changefreq: "weekly",
    priority: "1.0",
  },
  {
    path: "demo/",
    title: "Live Demo · Forge Select",
    description:
      "Interactive showcase of every Forge Select feature: single/multi select, tags, drag-and-drop tag reordering, option groups, tree select, custom templates, rich items, virtual scrolling, i18n, and events.",
    changefreq: "monthly",
    priority: "0.8",
  },
  {
    path: "playground/",
    title: "Playground · Forge Select",
    description:
      "Write and run Forge Select code live in the browser with ready-made presets for every major feature — no install required.",
    changefreq: "monthly",
    priority: "0.7",
  },
  {
    path: "theme-builder/",
    title: "Theme Builder · Forge Select",
    description:
      "Customize every Forge Select CSS variable live and copy the generated theme CSS — no build step required.",
    changefreq: "monthly",
    priority: "0.6",
  },
];

const md = new MarkdownIt({
  html: true,
  linkify: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return "";
  },
});

function sitemapEntries() {
  const docsEntries = DOCS.map((d) => ({
    path: d.slug === "index" ? "docs/" : `docs/${d.slug}.html`,
    changefreq: "monthly",
    priority: d.slug === "index" ? "0.6" : "0.5",
  }));
  return [...STATIC_PAGES, ...docsEntries];
}

function generateSitemap() {
  const urls = sitemapEntries()
    .map(
      (p) => `  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function generateRobotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`;
}

function generateLlmsTxt() {
  const docsLinks = DOCS.map(
    (d) => `- [${d.title}](${SITE_URL}${d.slug === "index" ? "docs/" : `docs/${d.slug}.html`}): ${d.description}`,
  ).join("\n");
  return `# Forge Select

> ${pkg.description}

Forge Select (v${pkg.version}) is a zero-runtime-dependency, framework-agnostic TypeScript select/combobox component — a modern replacement for Select2. It ships ESM/CJS/IIFE bundles with type declarations, automatic virtualization for large option lists, tags with drag-and-drop reordering, tree select, AJAX/remote data loading, rich item templates, i18n, and a small plugin architecture.

## Docs

${docsLinks}

## Try it

- [Live demo](${SITE_URL}demo/): a curated showcase of every feature.
- [Playground](${SITE_URL}playground/): write and run Forge Select code live in the browser.
- [Theme Builder](${SITE_URL}theme-builder/): customize every CSS variable live and copy the generated theme CSS.

## Source

- [GitHub repository](https://github.com/cmm-cmm/ForgeSelect)
- [npm package](https://www.npmjs.com/package/${pkg.name})
- License: ${pkg.license}
`;
}

function breadcrumbJsonLd(items) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  });
}

function techArticleJsonLd({ title, description, canonicalPath }) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description,
    url: `${SITE_URL}${canonicalPath}`,
    mainEntityOfPage: `${SITE_URL}${canonicalPath}`,
  });
}

function layout({ title, description, canonicalPath, jsonLdBlocks, active, content }) {
  const nav = (href, label, key) => `<a href="${href}"${active === key ? ' class="active"' : ""}>${label}</a>`;
  const side = DOCS.map(
    (d) =>
      `<li><a href="./${d.slug === "index" ? "" : `${d.slug}.html`}"${
        active === `docs:${d.slug}` ? ' class="active"' : ""
      }>${d.title}</a></li>`,
  ).join("\n        ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} · Forge Select</title>
<meta name="description" content="${description}">
<meta name="robots" content="index, follow">
<meta name="author" content="KonexForge">
<link rel="canonical" href="${SITE_URL}${canonicalPath}">
<link rel="sitemap" href="${SITE_URL}sitemap.xml" type="application/xml">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Forge Select">
<meta property="og:title" content="${title} · Forge Select">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${SITE_URL}${canonicalPath}">
<meta property="og:image" content="${SITE_URL}assets/og-banner.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Forge Select — select/combobox component banner">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title} · Forge Select">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${SITE_URL}assets/og-banner.png">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 28'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%2384cc16'/><stop offset='0.5' stop-color='%2322c55e'/><stop offset='1' stop-color='%2315803d'/></linearGradient></defs><path d='M4 3L12 9L20 3' stroke='url(%23g)' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' fill='none'/><path d='M4 12L12 18L20 12' stroke='url(%23g)' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' fill='none'/><path d='M4 21L12 27L20 21' stroke='url(%23g)' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' fill='none'/></svg>">
<link rel="apple-touch-icon" href="../assets/app-icon.png">
<link rel="stylesheet" href="../assets/site.css">
<link rel="stylesheet" href="../assets/hljs-light.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="../assets/hljs-dark.css" media="(prefers-color-scheme: dark)">
${jsonLdBlocks.map((j) => `<script type="application/ld+json">${j}</script>`).join("\n")}
</head>
<body>
<header class="site-header">
  <a class="site-logo" href="../"><span class="mark"><svg viewBox="0 0 24 28" fill="none" aria-hidden="true"><defs><linearGradient id="fsLogoGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#84cc16"/><stop offset="0.5" stop-color="#22c55e"/><stop offset="1" stop-color="#15803d"/></linearGradient></defs><path d="M4 3L12 9L20 3" stroke="url(#fsLogoGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12L12 18L20 12" stroke="url(#fsLogoGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 21L12 27L20 21" stroke="url(#fsLogoGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span> Forge Select <span class="version">v${pkg.version}</span></a>
  <nav class="site-nav">
    ${nav("../demo/", "Live Demo", "demo")}
    ${nav("./", "Docs", "docs")}
    ${nav("../playground/", "Playground", "playground")}
    ${nav("../theme-builder/", "Theme Builder", "theme-builder")}
    <a href="https://github.com/cmm-cmm/ForgeSelect">GitHub</a>
    <a href="https://www.npmjs.com/package/forge-select">npm</a>
  </nav>
</header>
<div class="docs-shell">
  <aside class="docs-sidebar">
    <p class="group">Documentation</p>
    <ul>
        ${side}
    </ul>
  </aside>
  <article class="docs-article">
${content}
  </article>
</div>
<footer class="site-footer">
  MIT License · Built with ❤️ by KonexForge · <a href="https://github.com/cmm-cmm/ForgeSelect">GitHub</a>
</footer>
</body>
</html>
`;
}

/** Rewrite markdown-relative links to their location on the site. */
function rewriteLinks(html) {
  return html
    .replace(/href="\.\/README\.md(#[^"]*)?"/g, 'href="./$1"')
    .replace(/href="\.\.\/README\.md(#[^"]*)?"/g, 'href="../$1"')
    .replace(/href="\.\/([\w-]+)\.md(#[^"]*)?"/g, 'href="./$1.html$2"')
    .replace(/href="\.\/docs\/([\w-]+)\.md(#[^"]*)?"/g, 'href="./docs/$1.html$2"')
    .replace(
      /href="\.\/packages\/(react|vue)\/CHANGELOG\.md"/g,
      'href="https://github.com/cmm-cmm/ForgeSelect/blob/main/packages/$1/CHANGELOG.md"',
    );
}

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, "docs"), { recursive: true });

  // Static pieces
  await cp(path.join(root, "site/index.html"), path.join(out, "index.html"));
  await cp(path.join(root, "site/assets"), path.join(out, "assets"), { recursive: true });
  // Rasterize the OG banner at build time (not committed) — Twitter/X and
  // LinkedIn render svg og:image/twitter:image inconsistently, so a real
  // PNG is required for a reliable social preview.
  await sharp(path.join(out, "assets/og-banner.svg")).png().toFile(path.join(out, "assets/og-banner.png"));
  // Separate square app icon for apple-touch-icon — the wide 1200x630
  // og-banner is the wrong aspect ratio for a home-screen icon and gets
  // squished/cropped on iOS.
  await sharp(path.join(out, "assets/app-icon.svg"))
    .resize(180, 180)
    .png()
    .toFile(path.join(out, "assets/app-icon.png"));
  await cp(path.join(root, "site/playground"), path.join(out, "playground"), { recursive: true });
  await cp(path.join(root, "site/theme-builder"), path.join(out, "theme-builder"), { recursive: true });
  await cp(path.join(root, "demo"), path.join(out, "demo"), { recursive: true });
  await cp(path.join(root, "dist"), path.join(out, "dist"), { recursive: true });
  await cp(path.join(root, "styles"), path.join(out, "styles"), { recursive: true });
  for (const relative of ["index.html", "demo/index.html", "playground/index.html", "theme-builder/index.html"]) {
    const file = path.join(out, relative);
    const html = await readFile(file, "utf8");
    await writeFile(file, html.replaceAll("{{FORGE_SELECT_VERSION}}", pkg.version));
  }
  await writeFile(path.join(out, "sitemap.xml"), generateSitemap());
  await writeFile(path.join(out, "robots.txt"), generateRobotsTxt());
  await writeFile(path.join(out, "llms.txt"), generateLlmsTxt());

  // Syntax-highlighting themes, toggled via media queries in the layout
  await cp(path.join(root, "node_modules/highlight.js/styles/github.min.css"), path.join(out, "assets/hljs-light.css"));
  await cp(
    path.join(root, "node_modules/highlight.js/styles/github-dark.min.css"),
    path.join(out, "assets/hljs-dark.css"),
  );

  // Docs pages
  for (const doc of DOCS) {
    const source = await readFile(path.join(root, doc.file), "utf8");
    const content = rewriteLinks(md.render(source));
    const canonicalPath = doc.slug === "index" ? "docs/" : `docs/${doc.slug}.html`;
    const breadcrumb = breadcrumbJsonLd(
      doc.slug === "index"
        ? [
            { name: "Home", url: SITE_URL },
            { name: "Docs", url: `${SITE_URL}docs/` },
          ]
        : [
            { name: "Home", url: SITE_URL },
            { name: "Docs", url: `${SITE_URL}docs/` },
            { name: doc.title, url: `${SITE_URL}${canonicalPath}` },
          ],
    );
    const html = layout({
      title: doc.title,
      description: doc.description,
      canonicalPath,
      jsonLdBlocks: [breadcrumb, techArticleJsonLd({ title: doc.title, description: doc.description, canonicalPath })],
      active: `docs:${doc.slug}`,
      content,
    });
    await writeFile(path.join(out, "docs", `${doc.slug}.html`), html);
  }

  console.log(`Site assembled in ${path.relative(root, out)}/`);
}

await main();
