import * as v from "valibot";

/**
 * Valibot has no `coerce`, and query strings and path params arrive as strings.
 * The pipe starts at `unknown` rather than `string` for two reasons: a JSON body
 * legitimately sends a number, and `v.optional(schema, fallback)` types its
 * fallback as the schema's *input*, so an input of `string` would force the
 * defaults to be written as `"20"`.
 *
 * `Number(undefined)` is `NaN`, which fails `v.number()` with "Expected number
 * but received NaN" — so a junk `?limit=abc` is a 422, never a silent default.
 */
export function integerFrom(min: number, max: number) {
  return v.pipe(
    v.unknown(),
    v.transform(Number),
    v.number(),
    v.integer(),
    v.minValue(min),
    v.maxValue(max),
  );
}
