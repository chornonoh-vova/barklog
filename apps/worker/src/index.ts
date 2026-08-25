import cron from "node-cron";

import { createContext } from "./context.js";
import { parseEnv } from "./env.js";
import { syncAll } from "./sync.js";

const env = parseEnv(process.env);
const { deps, close } = createContext(env);

const task = cron.schedule(
  env.SYNC_CRON,
  async () => {
    await syncAll(deps);
  },
  { timezone: env.SYNC_TZ },
);

console.log(`[worker] scheduled "${env.SYNC_CRON}" (${env.SYNC_TZ})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`[worker] ${signal} — shutting down`);
    await task.stop();
    await close();
    process.exit(0);
  });
}
