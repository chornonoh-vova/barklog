import { describe, expect, it } from "vitest";

import { gameUrl } from "@/igdb-url";

describe("gameUrl", () => {
  it("builds the igdb.com page URL the attribution links to", () => {
    expect(gameUrl("mortal-shell-ii")).toBe("https://www.igdb.com/games/mortal-shell-ii");
  });
});
