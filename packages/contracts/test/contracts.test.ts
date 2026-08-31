import * as v from "valibot";
import { expect, test } from "vitest";

import {
  backlogListQuerySchema,
  backlogUpsertSchema,
  gameFeedQuerySchema,
  gameIdParamSchema,
  MAX_GAME_ID,
  searchQuerySchema,
  SIMILAR_LIMIT_DEFAULT,
  similarQuerySchema,
} from "../src/index.js";

const parse = <T extends v.GenericSchema>(schema: T, input: unknown) =>
  v.parse(schema, input) as v.InferOutput<T>;
const accepts = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

test("search defaults limit and offset so a bare ?q= is valid", () => {
  expect(parse(searchQuerySchema, { q: "zelda" })).toEqual({
    q: "zelda",
    limit: 20,
    offset: 0,
  });
});

test("search coerces the numeric strings a query string actually carries", () => {
  expect(parse(searchQuerySchema, { q: "zelda", limit: "50", offset: "200" })).toEqual({
    q: "zelda",
    limit: 50,
    offset: 200,
  });
});

test("search trims q before the length check, so a padded single letter fails", () => {
  expect(accepts(searchQuerySchema, { q: " a " })).toBe(false);
  expect(parse(searchQuerySchema, { q: "  zelda  " }).q).toBe("zelda");
});

test("search rejects the bounds the spec puts on limit and offset", () => {
  expect(accepts(searchQuerySchema, { q: "zelda", limit: 51 })).toBe(false);
  expect(accepts(searchQuerySchema, { q: "zelda", limit: 0 })).toBe(false);
  expect(accepts(searchQuerySchema, { q: "zelda", offset: 201 })).toBe(false);
  expect(accepts(searchQuerySchema, { q: "zelda", limit: "abc" })).toBe(false);
});

test("a game feed defaults its limit and caps it at 50", () => {
  expect(parse(gameFeedQuerySchema, {})).toEqual({ limit: 20 });
  expect(accepts(gameFeedQuerySchema, { limit: 51 })).toBe(false);
});

test("the backlog list defaults to the most recently updated first", () => {
  expect(parse(backlogListQuerySchema, {})).toEqual({ sort: "updated_at" });
  expect(parse(backlogListQuerySchema, { status: "playing", sort: "name" })).toEqual({
    status: "playing",
    sort: "name",
  });
  expect(accepts(backlogListQuerySchema, { status: "finished" })).toBe(false);
  expect(accepts(backlogListQuerySchema, { sort: "id" })).toBe(false);
});

test("an upsert body is a status and an optional 1-10 rating", () => {
  expect(parse(backlogUpsertSchema, { status: "completed", rating: 9 })).toEqual({
    status: "completed",
    rating: 9,
  });
  expect(parse(backlogUpsertSchema, { status: "waiting" })).toEqual({ status: "waiting" });
  expect(parse(backlogUpsertSchema, { status: "playing", rating: null })).toEqual({
    status: "playing",
    rating: null,
  });
  expect(accepts(backlogUpsertSchema, { status: "playing", rating: 0 })).toBe(false);
  expect(accepts(backlogUpsertSchema, { status: "playing", rating: 11 })).toBe(false);
  expect(accepts(backlogUpsertSchema, { status: "playing", rating: 7.5 })).toBe(false);
});

test("an upsert body rejects an unknown key, and names it", () => {
  const result = v.safeParse(backlogUpsertSchema, { status: "playing", note: "hi" });

  expect(result.success).toBe(false);
  expect(result.issues?.map((issue) => v.getDotPath(issue))).toEqual(["note"]);
});

test("a path id coerces from its string form and rejects nonsense", () => {
  expect(parse(gameIdParamSchema, { id: "1942" })).toEqual({ id: 1942 });
  expect(accepts(gameIdParamSchema, { id: "abc" })).toBe(false);
  expect(accepts(gameIdParamSchema, { id: "0" })).toBe(false);
  expect(accepts(gameIdParamSchema, { id: "-3" })).toBe(false);
});

test("a path id above int4 range is rejected; the int4 max is accepted", () => {
  expect(accepts(gameIdParamSchema, { id: String(MAX_GAME_ID + 1) })).toBe(false);
  expect(parse(gameIdParamSchema, { id: String(MAX_GAME_ID) })).toEqual({ id: MAX_GAME_ID });
});

test("the similar-games limit defaults to twelve, what IGDB actually supplies", () => {
  expect(SIMILAR_LIMIT_DEFAULT).toBe(12);
  expect(parse(similarQuerySchema, {})).toEqual({ limit: 12 });
});

test("the similar-games limit shares the search cap rather than inventing one", () => {
  expect(accepts(similarQuerySchema, { limit: 50 })).toBe(true);
  expect(accepts(similarQuerySchema, { limit: 51 })).toBe(false);
  expect(accepts(similarQuerySchema, { limit: 0 })).toBe(false);
  expect(accepts(similarQuerySchema, { limit: "abc" })).toBe(false);
});
