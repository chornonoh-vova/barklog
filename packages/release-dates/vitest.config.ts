import { defineConfig } from "vitest/config";

// ADR-0010: full coverage, enforced only when run with --coverage (`pnpm test`).
export default defineConfig({
  test: {
    name: "@repo/release-dates",
    // Reuse workers across files: tests reset their own state, and per-file
    // startup roughly doubled the container-backed suites.
    isolate: false,
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary"],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
