import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { problems } from "../problems.js";
import type { AppDeps, AppEnv, Db } from "../types.js";

/** Neither check may hold a probe open longer than this. */
export const READINESS_TIMEOUT_MS = 1_000;

async function withTimeout(check: Promise<boolean>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      check.catch(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkPostgres(db: Db): Promise<boolean> {
  await db.execute(sql`select 1`);
  return true;
}

export function probeRoutes(deps: AppDeps) {
  return (
    new Hono<AppEnv>()
      // Liveness: no I/O at all. 200 whenever the event loop turns.
      .get("/healthz", (c) => c.json({ status: "ok" } as const))
      // Readiness: strict on both dependencies.
      .get("/readyz", async (c) => {
        const [postgres, valkey] = await Promise.all([
          withTimeout(checkPostgres(deps.db), READINESS_TIMEOUT_MS),
          withTimeout(deps.cache.ping(), READINESS_TIMEOUT_MS),
        ]);

        const checks = {
          postgres: postgres ? "up" : "down",
          valkey: valkey ? "up" : "down",
        } as const;

        if (!postgres || !valkey) {
          // The probes are not request-logged, and a thrown problem is not
          // logged by `app.onError` either, so this line is the only trace a
          // readiness failure leaves behind. It is worth having.
          getLogger(["api", "readiness"]).warn("Not ready: {checks}", { checks });

          // A problem document, so even the probe honours spec §11 — and the
          // body stays terse: component names and up/down, nothing else. No
          // detail (it is a 5xx) and no driver error string; these endpoints are
          // unauthenticated.
          throw problems.create("SERVICE_UNAVAILABLE", { extensions: { checks } });
        }

        return c.json({ status: "ok", checks } as const);
      })
  );
}
