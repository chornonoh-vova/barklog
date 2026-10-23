import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "landing",
    globalSetup: ["./test/setup/build.ts"],
    // An Astro production build, not a unit test.
    testTimeout: 30_000,
  },
});
