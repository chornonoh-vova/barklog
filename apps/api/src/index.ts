import { serve } from "@hono/node-server";
import { getLogger } from "@logtape/logtape";
import { createCache } from "@repo/cache";
import { createDb } from "@repo/db";
import { configureLogging } from "@repo/logging";

import { createApp } from "./app.js";
import { clerkAuthProvider } from "./clerk.js";
import { parseEnv } from "./env.js";
import { createShareProvider } from "./share/provider.js";

const env = parseEnv(process.env);

await configureLogging({ service: "api", level: env.LOG_LEVEL });
const log = getLogger(["api"]);

const { db, close: closeDb } = createDb(env.DATABASE_URL);
const cache = createCache(env.VALKEY_URL);

const app = createApp({
  db,
  cache,
  auth: clerkAuthProvider(env),
  share: createShareProvider(env),
  identifyModel: env.IDENTIFY_MODEL,
  production: env.NODE_ENV === "production",
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info("Listening on http://localhost:{port}", { port: info.port });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info("{signal} — shutting down", { signal });

    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();

    server.close(() => {
      // allSettled, not all: a rejected close must not swallow `process.exit`.
      void Promise.allSettled([closeDb(), cache.close()]).then(() => process.exit(0));
    });
  });
}
