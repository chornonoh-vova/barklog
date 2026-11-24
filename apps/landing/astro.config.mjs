import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import { SITE } from "./src/config.ts";

export default defineConfig({
  site: SITE,
  output: "static",
  build: {
    // NOT the default of "auto", which inlines stylesheets under ~4KB into a
    // <style> tag. That alone would force style-src 'unsafe-inline' and gut
    // the CSP in nginx/snippets/security-headers.conf. test/output.test.ts
    // fails if this regresses.
    inlineStylesheets: "never",
  },
  vite: { plugins: [tailwindcss()] },
});
