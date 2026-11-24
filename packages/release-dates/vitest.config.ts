import { defineConfig } from "vitest/config";

// ADR-0010: full coverage, enforced only when run with --coverage (`pnpm test`).
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
