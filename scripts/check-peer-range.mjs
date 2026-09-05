import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The wrappers take the core as a peer dependency so the app resolves exactly
// one copy of it. That only works while the declared range actually admits the
// core version being released alongside them: 0.9.0 shipped against wrappers
// still asking for ^0.8.0, and `npm install forge-select forge-select-react`
// failed with ERESOLVE until this was noticed. Nothing checked it, so nothing
// caught it — this does, from the same numbers npm would use.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRAPPERS = ["packages/react", "packages/vue"];
const failures = [];

const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const parse = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? match.slice(1, 4).map(Number) : null;
};
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Understands the two shapes a peer range is written in here: an explicit
 * `>=lower <upper` pair, and a caret. Caret on a 0.x version only admits that
 * same minor — `^0.8.0` is `>=0.8.0 <0.9.0`, which is exactly how 0.9.0 came
 * to be excluded. Anything else fails rather than being waved through: a range
 * this script cannot evaluate is a range it cannot vouch for.
 */
const bounds = (range) => {
  const pair = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (pair) return { lower: parse(pair[1]), upper: parse(pair[2]) };

  const caret = /^\^\s*(\d+)\.(\d+)\.(\d+)$/.exec(range.trim());
  if (caret) {
    const [major, minor, patch] = caret.slice(1, 4).map(Number);
    const upper = major > 0 ? [major + 1, 0, 0] : [0, minor + 1, 0];
    return { lower: [major, minor, patch], upper };
  }
  return null;
};

const core = await readJson("package.json");
const coreVersion = parse(core.version);
if (!coreVersion) failures.push(`root package.json has an unparseable version: ${core.version}`);

for (const wrapper of WRAPPERS) {
  const pkg = await readJson(`${wrapper}/package.json`);
  const declared = pkg.peerDependencies?.[core.name];

  if (pkg.dependencies?.[core.name]) {
    failures.push(
      `${pkg.name} lists ${core.name} under dependencies; it must stay a peer so the app resolves a single copy`,
    );
  }
  if (!declared) {
    failures.push(`${pkg.name} does not declare ${core.name} in peerDependencies`);
    continue;
  }

  const range = bounds(declared);
  if (!range) {
    failures.push(
      `${pkg.name} declares ${core.name} as "${declared}", which this check cannot evaluate (want ">=x.y.z <x.y.z")`,
    );
    continue;
  }
  if (!coreVersion) continue;
  if (compare(coreVersion, range.lower) < 0 || compare(coreVersion, range.upper) >= 0) {
    failures.push(
      `${pkg.name} peers on ${core.name}@"${declared}", which excludes the ${core.version} being released; ` +
        `installing both would fail to resolve`,
    );
  }
}

if (failures.length) {
  console.error(`Peer range check failed:\n${failures.map((line) => `  - ${line}`).join("\n")}`);
  process.exit(1);
}
console.log(`Peer ranges admit ${core.name}@${core.version}.`);
