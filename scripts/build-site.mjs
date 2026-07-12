/**
 * Assembles the GitHub Pages site into _site/:
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "_site");

const DOCS = [
  { file: "README.md", slug: "index", title: "Introduction" },
  { file: "api-reference.md", slug: "api-reference", title: "API Reference" },
  { file: "examples.md", slug: "examples", title: "Examples" },
  { file: "playground.md", slug: "playground", title: "Playground" },
  { file: "migration-from-select2.md", slug: "migration-from-select2", title: "Migration from Select2" },
  { file: "benchmarks.md", slug: "benchmarks", title: "Benchmarks" },
  { file: "plugin-development.md", slug: "plugin-development", title: "Plugin Development" },
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

function layout({ title, active, content }) {
  const nav = (href, label, key) =>
    `<a href="${href}"${active === key ? ' class="active"' : ""}>${label}</a>`;
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
<title>${title} · ForgeSelect</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%2310b981' d='M6 2l12 11h-6.9l3.6 6.9-2.7 1.4-3.6-6.9L6 18z'/></svg>">
<link rel="stylesheet" href="../assets/site.css">
<link rel="stylesheet" href="../assets/hljs-light.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="../assets/hljs-dark.css" media="(prefers-color-scheme: dark)">
</head>
<body>
<header class="site-header">
  <a class="site-logo" href="../"><span class="mark"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 2l12 11h-6.9l3.6 6.9-2.7 1.4-3.6-6.9L6 18z"/></svg></span> ForgeSelect</a>
  <nav class="site-nav">
    ${nav("../demo/", "Live Demo", "demo")}
    ${nav("./", "Docs", "docs")}
    ${nav("../playground/", "Playground", "playground")}
    <a href="https://github.com/cmm-cmm/ForgeSelect">GitHub</a>
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
    .replace(/href="\.\/docs\/([\w-]+)\.md(#[^"]*)?"/g, 'href="./docs/$1.html$2"');
}

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, "docs"), { recursive: true });

  // Static pieces
  await cp(path.join(root, "site/index.html"), path.join(out, "index.html"));
  await cp(path.join(root, "site/assets"), path.join(out, "assets"), { recursive: true });
  await cp(path.join(root, "site/playground"), path.join(out, "playground"), { recursive: true });
  await cp(path.join(root, "demo"), path.join(out, "demo"), { recursive: true });
  await cp(path.join(root, "dist"), path.join(out, "dist"), { recursive: true });
  await cp(path.join(root, "styles"), path.join(out, "styles"), { recursive: true });
  await writeFile(path.join(out, ".nojekyll"), "");

  // Syntax-highlighting themes, toggled via media queries in the layout
  await cp(
    path.join(root, "node_modules/highlight.js/styles/github.min.css"),
    path.join(out, "assets/hljs-light.css"),
  );
  await cp(
    path.join(root, "node_modules/highlight.js/styles/github-dark.min.css"),
    path.join(out, "assets/hljs-dark.css"),
  );

  // Docs pages
  for (const doc of DOCS) {
    const source = await readFile(path.join(root, "docs", doc.file), "utf8");
    const content = rewriteLinks(md.render(source));
    const html = layout({ title: doc.title, active: `docs:${doc.slug}`, content });
    await writeFile(path.join(out, "docs", `${doc.slug}.html`), html);
  }

  console.log(`Site assembled in ${path.relative(root, out)}/`);
}

await main();
