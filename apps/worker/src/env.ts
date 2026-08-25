import { z } from "zod";

const required = z.string().min(1);

const envSchema = z.object({
  DATABASE_URL: required,
  VALKEY_URL: required,
  IGDB_CLIENT_ID: required,
  IGDB_CLIENT_SECRET: required,
  SYNC_CRON: z.string().min(1).default("0 0 * * *"),
  SYNC_TZ: z.string().min(1).default("UTC"),
});

export type WorkerEnv = z.infer<typeof envSchema>;

/**
 * Parsed once at boot so a missing secret stops the process immediately rather
 * than surfacing at midnight when the sync fires.
 */
export function parseEnv(source: Record<string, string | undefined>): WorkerEnv {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid worker environment — ${detail}`);
  }

  return result.data;
}
