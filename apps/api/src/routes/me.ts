import { getSubscription } from "@repo/db";
import { Hono } from "hono";

import { isPremium } from "../entitlement.js";
import { toEntitlement } from "../serialize.js";
import type { AppDeps, AppEnv } from "../types.js";

export function meRoutes(deps: AppDeps) {
  return new Hono<AppEnv>().get("/", async (c) => {
    const row = await getSubscription(deps.db, c.get("userId"));

    // no-store, not no-cache: this gates a paid feature, so a stale
    // revalidation is worse than a round trip.
    c.header("Cache-Control", "private, no-store");

    return c.json({
      premium: isPremium(row, new Date()),
      entitlement: row === null ? null : toEntitlement(row),
    });
  });
}
