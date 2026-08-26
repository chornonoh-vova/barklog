import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { problems } from "../problems.js";
import type { AppDeps, AppEnv, Db } from "../types.js";

/** Neither check may hold a probe open longer than this. */
export const READINESS_TIMEOUT_MS = 1_000;

/**
 * How long a `/readyz` verdict is reused before the dependencies are checked
 * again. `/readyz` is unauthenticated and, unlike `/api/*`, unrate-limited
 * (the limiter only mounts under `/api/*`), and every hit otherwise spends
 * one of the pool's connections on `select 1` plus a Valkey `PING`. A flood
 * of probe requests could starve the pool for real API traffic; memoising
 * the whole verdict for about a second bounds that without changing what a
 * caller who waits a beat between requests observes. Exported so a test can
 * assert on expiry directly instead of sleeping on a magic number.
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
  // Per-app state, deliberately closed over rather than module-level: each
  // `createApp`/`createTestApp` call gets its own memo, so tests that build
  // several apps in one file never share (or leak into) another app's cache.
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
      // The probes are not request-logged, and a thrown problem is not
      // logged by `app.onError` either, so this line is the only trace a
      // readiness failure leaves behind. It fires only for a fresh, actually
      // failed evaluation — not on every memo hit that reuses that verdict —
      // so a flood hitting a cached failure does not also flood the log.
      getLogger(["api", "readiness"]).warn("Not ready: {checks}", { checks });
    }

    return { ready, checks };
  }

  // Caches the whole verdict — both check results and the ready/not decision
  // — so a memo hit touches neither Postgres nor Valkey; caching only one
  // side would leave the amplification vector half-open. Concurrent requests
  // during one evaluation share `inFlight` rather than each starting their
  // own checks.
  async function getReadiness(): Promise<ReadinessVerdict> {
    if (cached && Date.now() < cached.expiresAt) return cached.verdict;

    // The reset lives in `finally`, not in the `then`, so it runs on both
    // outcomes: a rejected evaluation must not become permanent. Without
    // this, a single rejection would leave `inFlight` holding a
    // permanently-rejected promise forever, and `??=` would never reassign
    // it — every subsequent /readyz request would reject forever, which is
    // the opposite of what a readiness check is for.
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

  return (
    new Hono<AppEnv>()
      // Liveness: no I/O at all. 200 whenever the event loop turns.
      .get("/healthz", (c) => c.json({ status: "ok" } as const))
      // Readiness: strict on both dependencies, memoised for READINESS_CACHE_MS.
      .get("/readyz", async (c) => {
        const { ready, checks } = await getReadiness();

        if (!ready) {
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
