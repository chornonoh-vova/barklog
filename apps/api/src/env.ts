import { integerFrom } from "@repo/contracts";
import { LOG_LEVELS } from "@repo/logging";
import * as v from "valibot";

const required = v.pipe(v.string(), v.minLength(1));

const envSchema = v.object({
  PORT: v.optional(integerFrom(1, 65_535), 3000),
  DATABASE_URL: required,
  VALKEY_URL: required,
  CLERK_SECRET_KEY: required,
  CLERK_PUBLISHABLE_KEY: required,
  ANTHROPIC_API_KEY: required,
  IDENTIFY_MODEL: v.optional(required, "claude-sonnet-5"),
  NODE_ENV: v.optional(v.picklist(["development", "test", "production"]), "development"),
  LOG_LEVEL: v.optional(v.picklist(LOG_LEVELS), "info"),
});

export type ApiEnv = v.InferOutput<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): ApiEnv {
  const result = v.safeParse(envSchema, source);

  if (!result.success) {
    const detail = result.issues
      .map((issue) => `${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid API environment — ${detail}`);
  }

  return result.output;
}
