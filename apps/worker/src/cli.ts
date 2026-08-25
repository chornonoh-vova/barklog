import { createContext } from "./context.js";
import { parseEnv } from "./env.js";
import { syncAll } from "./sync.js";

const full = process.argv.includes("--full");
const { deps, close } = createContext(parseEnv(process.env));

try {
  const result = await syncAll(deps, { full });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "failed" ? 1 : 0;
} finally {
  await close();
}
