import { LOG_LEVELS } from "@repo/logging";
import * as v from "valibot";

const required = v.pipe(v.string(), v.minLength(1));

const envSchema = v.object({
  DATABASE_URL: required,
  VALKEY_URL: required,
  IGDB_CLIENT_ID: required,
  IGDB_CLIENT_SECRET: required,
  SYNC_CRON: v.optional(required, "0 0 * * *"),
  SYNC_TZ: v.optional(required, "UTC"),
  LOG_LEVEL: v.optional(v.picklist(LOG_LEVELS), "info"),
});

export type WorkerEnv = v.InferOutput<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): WorkerEnv {
  const result = v.safeParse(envSchema, source);

  if (!result.success) {
    const detail = result.issues
      .map((issue) => `${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid worker environment — ${detail}`);
  }

  return result.output;
}
