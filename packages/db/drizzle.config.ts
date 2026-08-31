import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "drizzle-kit";

// drizzle-kit has no `--env-file`, so the root .env is loaded here. Resolved
// against cwd: drizzle-kit's bundler leaves `import.meta.dirname` undefined.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (fs.existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

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
