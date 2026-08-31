import { defineConfig } from "vitest/config";

// A separate config, not `--exclude ''`: a CLI --exclude appends to the config's
// list rather than replacing it, so the default exclusion would still apply.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    include: ["test/contract.test.ts"],
  },
});
