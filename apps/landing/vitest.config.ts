import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "landing",
    // Reuse workers across files: tests reset their own state, and per-file
    // startup roughly doubled the container-backed suites.
    isolate: false,
    // reveal.test.ts stubs IntersectionObserver; keep it from reaching later files.
    unstubGlobals: true,
    globalSetup: ["./test/setup/build.ts"],
    // An Astro production build, not a unit test.
    testTimeout: 30_000,
  },
});
