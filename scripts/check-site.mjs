import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "_site");
const failures = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else files.push(target);
  }
  return files;
}

for (const file of (await walk(site)).filter((entry) => entry.endsWith(".html"))) {
  const html = await readFile(file, "utf8");
  for (const match of html.matchAll(/(?:href|src)="([^"#?]+)"/g)) {
    const url = match[1];
    if (/^(?:https?:|mailto:|data:|\/\/)/.test(url)) continue;
    let target = path.resolve(path.dirname(file), url);
    if (url.endsWith("/")) target = path.join(target, "index.html");
    try {
      await access(target);
    } catch {
      failures.push(`${path.relative(site, file)} -> ${url}`);
    }
  }
}

if (failures.length) throw new Error(`Broken local site links:\n${failures.join("\n")}`);
console.log("All generated local site links and assets exist.");
