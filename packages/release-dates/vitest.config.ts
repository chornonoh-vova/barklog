import { defineConfig } from "vitest/config";

// ADR-0010: this package is held to full coverage. `pnpm test` runs with
// --coverage, so CI fails when any threshold drops below 100; a single-file
// run without the flag is not held to the package-wide thresholds.
export default defineConfig({
  test: {
    name: "@repo/release-dates",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary"],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
