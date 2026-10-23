import { Hono } from "hono";

import { readEntitlement } from "../entitlement.js";
import type { AppDeps, AppEnv } from "../types.js";

export function meRoutes(deps: AppDeps) {
  return new Hono<AppEnv>().get("/", async (c) => {
    // no-store, not no-cache: this gates a paid feature, so a stale
    // revalidation is worse than a round trip.
    c.header("Cache-Control", "private, no-store");

    return c.json(await readEntitlement(deps.db, c.get("userId"), new Date()));
  });
}
