import { integerFrom } from "@repo/contracts";
import { LOG_LEVELS } from "@repo/logging";
import * as v from "valibot";

const required = v.pipe(v.string(), v.minLength(1));

/**
 * Models `extract.ts`'s request shape is verified to work on: `thinking: {
 * type: "disabled" }` is accepted, and structured outputs via
 * `output_config.format` are supported. Anything else — including
 * claude-haiku-4-5, where thinking-disabled is undocumented, and
 * claude-fable-5, where it 400s — routes silently onto the fail-soft path,
 * which is the `maxItems` incident again. Extend this list only once both
 * properties are confirmed in current Anthropic documentation for the
 * candidate model.
 *
 * claude-opus-5's entry is conditional: it accepts `thinking: { type:
 * "disabled" }` only at `output_config.effort` of `high` or lower — `xhigh`
 * or `max` gets a 400, checked per request. It qualifies today only because
 * `extract.ts` never sets `output_config.effort`, so its default of `high`
 * applies. Setting effort to `xhigh` there would 400 every request on this
 * model and route it onto the fail-soft path.
 */
const IDENTIFY_MODELS = ["claude-sonnet-5", "claude-opus-5", "claude-opus-4-8"] as const;

const envSchema = v.object({
  PORT: v.optional(integerFrom(1, 65_535), 3000),
  DATABASE_URL: required,
  VALKEY_URL: required,
  CLERK_SECRET_KEY: required,
  CLERK_PUBLISHABLE_KEY: required,
  ANTHROPIC_API_KEY: required,
  IDENTIFY_MODEL: v.optional(v.picklist(IDENTIFY_MODELS), "claude-sonnet-5"),
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
