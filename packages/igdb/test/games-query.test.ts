import { expect, test } from "vitest";

import { GAME_FIELDS, gamesPageQuery } from "../src/games-query.js";

test("the field list contains no deprecated fields", () => {
  // `category` and `status` were deprecated in favour of `game_type` and
  // `game_status`. Spec §7. This needs no network, so it guards every PR;
  // the live contract test (test/contract.test.ts) catches IGDB-side removals.
  expect(GAME_FIELDS).not.toMatch(/(^|,)category(\.|,|$)/);
  expect(GAME_FIELDS).not.toMatch(/(^|,)status(\.|,|$)/);
  expect(GAME_FIELDS).toContain("game_type.type");
});

test("every requested field is expressed with non-deprecated syntax", () => {
  // game_type is a reference now, not an inline enum, so it must be expanded.
  expect(GAME_FIELDS).toContain("game_type.id");
  expect(GAME_FIELDS).toContain("involved_companies.company.id");
  expect(GAME_FIELDS).toContain("cover.image_id");
});

test("the query never requests more than IGDB's 500-row maximum", () => {
  expect(gamesPageQuery({ since: null, afterId: 0, limit: 500 })).toContain("limit 500;");
});
