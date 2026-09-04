import type { GameSummaryWire } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { toShareSections } from "@/features/share/sections";

const ITEMS = [{ id: 1, name: "Elden Ring" }, { id: 2, name: "Hades" }] as GameSummaryWire[];

describe("toShareSections", () => {
  it("labels a title-derived group as such", () => {
    const [section, ...rest] = toShareSections("title", ITEMS, "Snamwiches");

    expect(rest).toEqual([]);
    expect(section?.title).toBe("Matches for the video title");
    expect(section?.data).toEqual(ITEMS);
  });

  it("names the channel when the guesses came from it, so the assumption is visible", () => {
    expect(toShareSections("channel", ITEMS, "Snamwiches")[0]?.title).toBe(
      "Snamwiches's usual games",
    );
  });

  it("still labels a channel group when oEmbed gave no author", () => {
    expect(toShareSections("channel", ITEMS, null)[0]?.title).toBe("This channel's usual games");
  });

  it("gives the fail-soft group no header, since the notice above the list explains it", () => {
    const [section] = toShareSections("unavailable", ITEMS, "Snamwiches");

    expect(section?.title).toBeNull();
    expect(section?.data).toEqual(ITEMS);
  });

  it("is empty for `none`, which has nothing to group", () => {
    expect(toShareSections("none", [], "Snamwiches")).toEqual([]);
  });

  it("is empty when the search found nothing, so the empty state owns the screen", () => {
    expect(toShareSections("title", [], "Snamwiches")).toEqual([]);
    expect(toShareSections("unavailable", [], "Snamwiches")).toEqual([]);
  });
});
