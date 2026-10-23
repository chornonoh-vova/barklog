import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo/contracts",
    include: ["test/**/*.test.ts"],
  },
});
