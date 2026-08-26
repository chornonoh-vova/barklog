import { getLogger } from "@logtape/logtape";
import { configureLogging } from "@repo/logging";
import cron from "node-cron";

import { createContext } from "./context.js";
import { parseEnv } from "./env.js";
import { syncAll } from "./sync.js";

const env = parseEnv(process.env);

// Before anything else logs: a record written before this lands nowhere.
await configureLogging({ service: "worker", level: env.LOG_LEVEL });
const log = getLogger(["worker"]);

const { deps, close } = createContext(env);

const task = cron.schedule(
  env.SYNC_CRON,
  async () => {
    await syncAll(deps);
  },
  { timezone: env.SYNC_TZ },
);

log.info("Scheduled {cron} ({timezone}).", { cron: env.SYNC_CRON, timezone: env.SYNC_TZ });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    log.info("{signal} — shutting down.", { signal });
    await task.stop();
    await close();
    process.exit(0);
  });
}
