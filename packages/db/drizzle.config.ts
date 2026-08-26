import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "drizzle-kit";

// drizzle-kit is a bare CLI, so there is no `--env-file` to forward the way
// `db:migrate` does — the root .env is loaded here instead. Resolved against
// the cwd rather than `import.meta.dirname`, which drizzle-kit's bundler
// leaves undefined. Variables already in the environment win, so CI and deploy
// runs are untouched.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (fs.existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

// No default: a fallback URL turns "the env did not load" into a silent write
// against local dev, which is the wrong place to find that out.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required — set it or add it to the root .env");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
