import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure schema unit tests: no containers, no global setup.
    include: ["test/**/*.test.ts"],
  },
});
