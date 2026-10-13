import { describe, expect, it } from "vitest";

import { parseRecents, pushRecent, RECENT_LIMIT } from "@/features/search/recents";

describe("pushRecent", () => {
  it("puts the newest query first", () => {
    expect(pushRecent(["zelda"], "hades")).toEqual(["hades", "zelda"]);
  });

  it("moves a repeated query to the top instead of duplicating it, ignoring case", () => {
    expect(pushRecent(["hades", "Zelda", "celeste"], "zelda")).toEqual([
      "zelda",
      "hades",
      "celeste",
    ]);
  });

  it("trims the query", () => {
    expect(pushRecent([], "  hades  ")).toEqual(["hades"]);
  });

  it("ignores an empty query", () => {
    expect(pushRecent(["hades"], "   ")).toEqual(["hades"]);
  });

  it("keeps at most RECENT_LIMIT", () => {
    const full = Array.from({ length: RECENT_LIMIT }, (_, i) => `game ${i}`);
    const next = pushRecent(full, "new");

    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe("new");
    expect(next).not.toContain(`game ${RECENT_LIMIT - 1}`);
  });

  it("does not mutate its input", () => {
    const list = ["hades"];
    pushRecent(list, "zelda");
    expect(list).toEqual(["hades"]);
  });
});

describe("parseRecents", () => {
  it("reads a stored list", () => {
    expect(parseRecents('["hades","zelda"]')).toEqual(["hades", "zelda"]);
  });

  it.each([null, "", "not json", "{}", "42", '"hades"'])(
    "returns nothing for missing or foreign data (%s)",
    (raw) => {
      expect(parseRecents(raw)).toEqual([]);
    },
  );

  it("drops entries that are not non-empty strings", () => {
    expect(parseRecents('["hades", 3, null, "", "zelda"]')).toEqual(["hades", "zelda"]);
  });

  it("trims entries and drops whitespace-only ones", () => {
    expect(parseRecents('["  hades ", "   ", "zelda"]')).toEqual(["hades", "zelda"]);
  });

  it("caps an oversized list", () => {
    const raw = JSON.stringify(Array.from({ length: 20 }, (_, i) => `g${i}`));
    expect(parseRecents(raw)).toHaveLength(RECENT_LIMIT);
  });
});
