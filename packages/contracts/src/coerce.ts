import * as v from "valibot";

/**
 * Starts at `unknown`, not `string`: `v.optional(schema, fallback)` types its
 * fallback as the schema's *input*, so `string` would force defaults like `"20"`.
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
