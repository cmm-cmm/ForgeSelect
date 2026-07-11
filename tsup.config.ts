import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs", "iife"],
  globalName: "ForgeSelectBundle",
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
});
