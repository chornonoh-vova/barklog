import { defineConfig } from "vitest/config";

/**
 * Separate config rather than `--exclude ''`: a CLI --exclude is appended to the
 * config's list, not substituted for it, so the default config's exclusion of
 * this file would still apply.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    include: ["test/contract.test.ts"],
  },
});
