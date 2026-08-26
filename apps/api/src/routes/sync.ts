import { getLastRun } from "@repo/db";
import { Hono } from "hono";

import type { AppDeps, AppEnv } from "../types.js";

export function syncRoutes(deps: AppDeps) {
  return new Hono<AppEnv>().get("/status", async (c) => {
    const run = await getLastRun(deps.db);

    return c.json({
      lastRun:
        run === null
          ? null
          : {
              id: run.id,
              status: run.status,
              startedAt: run.startedAt.toISOString(),
              finishedAt: run.finishedAt?.toISOString() ?? null,
              watermark: run.watermark?.toISOString() ?? null,
              counts: run.counts,
            },
      // `run.error` is deliberately omitted: it is an exception message, and
      // spec §11's reasoning about 5xx detail applies to it just the same.
    });
  });
}
