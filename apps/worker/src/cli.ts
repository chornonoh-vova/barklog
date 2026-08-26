import { getLogger } from "@logtape/logtape";
import { configureLogging } from "@repo/logging";

import { createContext } from "./context.js";
import { parseEnv } from "./env.js";
import { syncAll } from "./sync.js";

const full = process.argv.includes("--full");
const env = parseEnv(process.env);

// Before anything else logs: a record written before this lands nowhere.
await configureLogging({ service: "worker", level: env.LOG_LEVEL });
const log = getLogger(["worker"]);

const { deps, close } = createContext(env);

try {
  const result = await syncAll(deps, { full });
  log.info("Sync {status}.", { status: result.status });
  process.exitCode = result.status === "failed" ? 1 : 0;
} finally {
  await close();
}
