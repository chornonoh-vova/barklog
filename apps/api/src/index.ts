import { serve } from "@hono/node-server";
import { getLogger } from "@logtape/logtape";
import { createCache } from "@repo/cache";
import { createDb } from "@repo/db";
import { configureLogging } from "@repo/logging";

import { createApp } from "./app.js";
import { clerkAuthProvider } from "./clerk.js";
import { parseEnv } from "./env.js";
import { resolveShortLink } from "./share/canonicalise.js";
import { fetchVideoMeta } from "./share/oembed.js";
import type { ShareProvider } from "./types.js";

const env = parseEnv(process.env);

await configureLogging({ service: "api", level: env.LOG_LEVEL });
const log = getLogger(["api"]);

const { db, close: closeDb } = createDb(env.DATABASE_URL);
const cache = createCache(env.VALKEY_URL);

// resolveShortLink and fetchMeta are wired to the real fetch; extractTitles
// is not implemented yet (a later task's job) and no route calls it yet.
const shareProvider: ShareProvider = {
  resolveShortLink: (url) => resolveShortLink(url, fetch),
  fetchMeta: (ref) => fetchVideoMeta(ref, fetch),
  extractTitles: () => {
    throw new Error("share.extractTitles is not implemented yet");
  },
};

const app = createApp({
  db,
  cache,
  auth: clerkAuthProvider(env),
  share: shareProvider,
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
