import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo/i18n",
    include: ["test/**/*.test.ts"],
  },
});
