import { describe, expect, it } from "vitest";

import { gameUrl, siteUrl } from "@/igdb-url";

describe("gameUrl", () => {
  it("builds the igdb.com page URL the attribution links to", () => {
    expect(gameUrl("mortal-shell-ii")).toBe("https://www.igdb.com/games/mortal-shell-ii");
  });
});

describe("siteUrl", () => {
  it("is the igdb.com root the onboarding attribution links to", () => {
    expect(siteUrl()).toBe("https://www.igdb.com");
  });

  it("shares its base with gameUrl", () => {
    expect(gameUrl("hollow-knight-silksong").startsWith(siteUrl())).toBe(true);
  });
});
