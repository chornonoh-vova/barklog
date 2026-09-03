import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://barklog.gg",
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
