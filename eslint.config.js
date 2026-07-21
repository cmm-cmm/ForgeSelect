import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "_site/**", "coverage/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/react/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["scripts/**/*.mjs", "*.config.{js,ts}", "*.config.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["site/**/*.js", "demo/**/*.js", "tests/e2e/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ForgeSelectBundle: "readonly" } },
  },
  {
    // The benchmark is a Node script whose page.evaluate callback executes in a browser.
    files: ["scripts/benchmark.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
