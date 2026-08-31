import { expect, test } from "vitest";

import { GAME_FIELDS, gamesPageQuery } from "../src/games-query.js";

test("the field list contains no deprecated fields", () => {
  expect(GAME_FIELDS).not.toMatch(/(^|,)category(\.|,|$)/);
  expect(GAME_FIELDS).not.toMatch(/(^|,)status(\.|,|$)/);
  expect(GAME_FIELDS).toContain("game_type.type");
});

test("every requested field is expressed with non-deprecated syntax", () => {
  expect(GAME_FIELDS).toContain("game_type.id");
  expect(GAME_FIELDS).toContain("involved_companies.company.id");
  expect(GAME_FIELDS).toContain("cover.image_id");
});

test("the query never requests more than IGDB's 500-row maximum", () => {
  expect(gamesPageQuery({ since: null, afterId: 0, limit: 500 })).toContain("limit 500;");
});

test("the field list requests similar games as bare ids", () => {
  expect(GAME_FIELDS).toContain("similar_games");
  expect(GAME_FIELDS).not.toMatch(/similar_games\./);
});
