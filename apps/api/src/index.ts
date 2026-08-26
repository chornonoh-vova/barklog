import { serve } from "@hono/node-server";
import { getLogger } from "@logtape/logtape";
import { createCache } from "@repo/cache";
import { createDb } from "@repo/db";
import { configureLogging } from "@repo/logging";

import { createApp } from "./app.js";
import { parseEnv } from "./env.js";

const env = parseEnv(process.env);

// Before anything else logs: a record written before this lands nowhere.
await configureLogging({ service: "api", level: env.LOG_LEVEL });
const log = getLogger(["api"]);

const { db, close: closeDb } = createDb(env.DATABASE_URL);
const cache = createCache(env.VALKEY_URL);

const app = createApp({ db, cache, production: env.NODE_ENV === "production" });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info("Listening on http://localhost:{port}", { port: info.port });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info("{signal} — shutting down", { signal });
    server.close(() => {
      void Promise.all([closeDb(), cache.close()]).then(() => process.exit(0));
    });
  });
}
