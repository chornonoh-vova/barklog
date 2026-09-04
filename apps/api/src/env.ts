import { integerFrom } from "@repo/contracts";
import { LOG_LEVELS } from "@repo/logging";
import * as v from "valibot";

const required = v.pipe(v.string(), v.minLength(1));

/**
 * Models `extract.ts`'s request shape is verified to work on: `reasoning: {
 * effort: "none" }` is accepted, and structured outputs are supported. A model
 * that rejects either 400s every request and routes silently onto the
 * fail-soft path, so extend this list only once both are confirmed in current
 * OpenAI documentation for the candidate.
 */
const IDENTIFY_MODELS = ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4"] as const;

const envSchema = v.object({
  PORT: v.optional(integerFrom(1, 65_535), 3000),
  DATABASE_URL: required,
  VALKEY_URL: required,
  CLERK_SECRET_KEY: required,
  CLERK_PUBLISHABLE_KEY: required,
  CLERK_WEBHOOK_SIGNING_SECRET: required,
  OPENAI_API_KEY: required,
  REVENUECAT_WEBHOOK_SECRET: required,
  REVENUECAT_WEBHOOK_SIGNING_SECRET: required,
  REVENUECAT_API_KEY: required,
  IDENTIFY_MODEL: v.optional(v.picklist(IDENTIFY_MODELS), "gpt-5.4-mini"),
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
