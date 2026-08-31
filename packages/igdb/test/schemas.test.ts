import * as v from "valibot";
import { expect, test } from "vitest";

import { igdbGameSchema } from "../src/schemas.js";

const MINIMAL = { id: 2, name: "Bare", slug: "bare", updated_at: 1_755_000_001 };

test("a row with every optional field omitted parses", () => {
  expect(v.parse(igdbGameSchema, MINIMAL)).toEqual(MINIMAL);
});

test("an omitted optional stays absent rather than becoming null", () => {
  expect(Object.keys(v.parse(igdbGameSchema, MINIMAL))).toEqual([
    "id",
    "name",
    "slug",
    "updated_at",
  ]);
});

test("fields we did not ask for are stripped", () => {
  const parsed = v.parse(igdbGameSchema, { ...MINIMAL, checksum: "abc", category: 0 });

  expect(parsed).not.toHaveProperty("checksum");
  expect(parsed).not.toHaveProperty("category");
});

test("a wrong type is rejected, naming the field", () => {
  const result = v.safeParse(igdbGameSchema, { ...MINIMAL, updated_at: "yesterday" });

  expect(result.success).toBe(false);
  expect(result.issues?.map((issue) => v.getDotPath(issue))).toEqual(["updated_at"]);
});

test("a malformed nested row is rejected, naming the path", () => {
  const result = v.safeParse(igdbGameSchema, {
    ...MINIMAL,
    genres: [{ id: 12, name: "Role-playing (RPG)" }],
  });

  expect(result.success).toBe(false);
  expect(result.issues?.map((issue) => v.getDotPath(issue))).toEqual(["genres.0.slug"]);
});

test("a non-integer id is rejected", () => {
  expect(v.safeParse(igdbGameSchema, { ...MINIMAL, id: 1.5 }).success).toBe(false);
});
