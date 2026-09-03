import { expect, test } from "vitest";

import { EROTIC_THEME_ID } from "../src/erotic-theme.js";
import { eroticGameIdsQuery, GAME_FIELDS, gamesPageQuery } from "../src/games-query.js";

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

test("the field list requests themes as bare ids", () => {
  expect(GAME_FIELDS).toContain("themes");
  expect(GAME_FIELDS).not.toMatch(/themes\./);
});

test("the erotic sweep asks only for ids, keyset-paged like the main query", () => {
  const query = eroticGameIdsQuery({ afterId: 0, limit: 500 });

  expect(query).toContain("fields id;");
  expect(query).toContain(`where themes = (${EROTIC_THEME_ID}) & id > 0;`);
  expect(query).toContain("sort id asc;");
  expect(query).toContain("limit 500;");
});

test("the erotic sweep pages past the highest id it has seen", () => {
  expect(eroticGameIdsQuery({ afterId: 123467, limit: 500 })).toContain("id > 123467;");
});

test("the erotic sweep does not narrow to games that still have screenshots", () => {
  // Narrowing would strand our copy of a screenshot IGDB has since removed.
  expect(eroticGameIdsQuery({ afterId: 0, limit: 500 })).not.toContain("screenshots");
});
