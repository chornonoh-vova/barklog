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
  service: string;
  level: LogLevel;
  sink?: Sink;
}

/**
 * `contextLocalStorage` is load-bearing: without it `withContext` and the Hono
 * request context silently degrade to no-ops that only warn on the meta logger.
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
