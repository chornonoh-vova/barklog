import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { problems } from "../problems.js";
import type { AppDeps, AppEnv, Db } from "../types.js";

export const READINESS_TIMEOUT_MS = 1_000;

/**
 * `/readyz` is unauthenticated and unrate-limited, so an unmemoised verdict
 * lets a flood of probes starve the pool. Caches the whole verdict, not one half.
 */
export const READINESS_CACHE_MS = 1_000;

interface ReadinessVerdict {
  ready: boolean;
  checks: { postgres: "up" | "down"; valkey: "up" | "down" };
}

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
  let cached: { verdict: ReadinessVerdict; expiresAt: number } | null = null;
  let inFlight: Promise<ReadinessVerdict> | null = null;

  async function evaluateReadiness(): Promise<ReadinessVerdict> {
    const [postgres, valkey] = await Promise.all([
      withTimeout(checkPostgres(deps.db), READINESS_TIMEOUT_MS),
      withTimeout(deps.cache.ping(), READINESS_TIMEOUT_MS),
    ]);

    const checks = {
      postgres: postgres ? "up" : "down",
      valkey: valkey ? "up" : "down",
    } as const;
    const ready = postgres && valkey;

    if (!ready) {
      getLogger(["api", "readiness"]).warn("Not ready: {checks}", { checks });
    }

    return { ready, checks };
  }

  async function getReadiness(): Promise<ReadinessVerdict> {
    if (cached && Date.now() < cached.expiresAt) return cached.verdict;

    // `finally`, not `then`: a rejection must clear `inFlight` too, or `??=`
    // never reassigns and every later probe rejects forever.
    inFlight ??= evaluateReadiness()
      .then((verdict) => {
        cached = { verdict, expiresAt: Date.now() + READINESS_CACHE_MS };
        return verdict;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  return new Hono<AppEnv>()
    .get("/healthz", (c) => c.json({ status: "ok" } as const))
    .get("/readyz", async (c) => {
      const { ready, checks } = await getReadiness();

      if (!ready) {
        throw problems.create("SERVICE_UNAVAILABLE", { extensions: { checks } });
      }

      return c.json({ status: "ok", checks } as const);
    });
}
