import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.tsx"],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
    include: ["tests/**/*.test.tsx"],
  },
});
