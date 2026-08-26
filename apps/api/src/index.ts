import { serve } from "@hono/node-server";
import { getLogger } from "@logtape/logtape";
import { createCache } from "@repo/cache";
import { createDb } from "@repo/db";
import { configureLogging } from "@repo/logging";

import { createApp } from "./app.js";
import { clerkAuthProvider } from "./clerk.js";
import { parseEnv } from "./env.js";

const env = parseEnv(process.env);

// Before anything else logs: a record written before this lands nowhere.
await configureLogging({ service: "api", level: env.LOG_LEVEL });
const log = getLogger(["api"]);

const { db, close: closeDb } = createDb(env.DATABASE_URL);
const cache = createCache(env.VALKEY_URL);

const app = createApp({
  db,
  cache,
  auth: clerkAuthProvider(env),
  production: env.NODE_ENV === "production",
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info("Listening on http://localhost:{port}", { port: info.port });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info("{signal} — shutting down", { signal });

    // Force-exit if graceful shutdown does not finish in time — one lingering
    // keep-alive connection (server.close's callback fires only once every
    // connection has ended) or a hung close() call must not hang the process
    // forever waiting for a SIGKILL. Unref'd so it never itself keeps the
    // process alive.
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();

    server.close(() => {
      // allSettled, not all: a rejected close (e.g. a Valkey socket already
      // gone on SIGTERM) must not swallow process.exit — every close is
      // attempted and exit runs regardless of the outcome.
      void Promise.allSettled([closeDb(), cache.close()]).then(() => process.exit(0));
    });
  });
}
