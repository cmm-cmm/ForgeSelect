import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2020",
  },
  {
    // The IIFE build is the CDN/<script> consumption path (no bundler to
    // minify it downstream), so it's the one format that needs minifying here.
    entry: ["src/index.ts"],
    format: ["iife"],
    globalName: "ForgeSelectBundle",
    minify: true,
    sourcemap: true,
    clean: false,
    target: "es2020",
  },
]);
