import { AsyncLocalStorage } from "node:async_hooks";

import {
  configure,
  getConsoleSink,
  jsonLinesFormatter,
  reset,
  type LogLevel,
  type Sink,
} from "@logtape/logtape";

export const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warning",
  "error",
  "fatal",
] as const satisfies readonly LogLevel[];

export type { LogLevel };

export interface LoggingOptions {
  /** Root category. Every logger in the process hangs off it: `["api", …]`. */
  service: string;
  level: LogLevel;
  /** Tests pass a recording sink; a process always wants the console. */
  sink?: Sink;
}

/**
 * One configuration for both processes: JSON lines on stdout, one object per
 * record, and an implicit context so a `traceId` or a `runId` reaches every
 * line written while it is in scope.
 *
 * `contextLocalStorage` is the load-bearing option. Without it `withContext`
 * and the Hono adapter's request context degrade to no-ops that only warn on
 * the meta logger — which is why the meta logger is wired to the same sink.
 */
export async function configureLogging(options: LoggingOptions): Promise<void> {
  await configure({
    reset: true,
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: { out: options.sink ?? getConsoleSink({ formatter: jsonLinesFormatter }) },
    loggers: [
      { category: [options.service], sinks: ["out"], lowestLevel: options.level },
      { category: ["logtape", "meta"], sinks: ["out"], lowestLevel: "warning" },
    ],
  });
}

export async function resetLogging(): Promise<void> {
  await reset();
}
