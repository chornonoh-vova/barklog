import { BACKLOG_STATUSES } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { IGDB_PAGE_ID, nextPageId, ONBOARDING_PAGES, pageIndex } from "@/features/onboarding/pages";

describe("ONBOARDING_PAGES", () => {
  it("is the four pages, in the agreed order", () => {
    expect(ONBOARDING_PAGES.map((page) => page.title)).toEqual([
      "Welcome to Barklog",
      "Managing your game backlog",
      "Exploring games",
      "All game data is powered by IGDB",
    ]);
  });

  it("gives every page a unique id", () => {
    const ids = ONBOARDING_PAGES.map((page) => page.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every page copy to show", () => {
    for (const page of ONBOARDING_PAGES) {
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.description.length).toBeGreaterThan(0);
      expect(page.systemImage.length).toBeGreaterThan(0);
    }
  });

  it("ends on the IGDB attribution", () => {
    // The last page carries the igdb.com link and the primary button says
    // "Start" there, both keyed on it being last.
    expect(ONBOARDING_PAGES.at(-1)?.id).toBe(IGDB_PAGE_ID);
  });

  it("names every real backlog status on the backlog page", () => {
    // The point of this test: rename a status in @repo/contracts and this fails,
    // rather than leaving onboarding describing an app that no longer exists.
    // A word-boundary regex, not `toContain`: a plain substring check would
    // still pass after renaming "playing" to "play", since "playing" contains
    // "play" — which defeats the point of the guard.
    const page = ONBOARDING_PAGES.find((candidate) => candidate.id === "backlog");

    expect(page).toBeDefined();

    for (const status of BACKLOG_STATUSES) {
      expect(page?.description.toLowerCase()).toMatch(new RegExp(`\\b${status}\\b`));
    }
  });
});

describe("pageIndex", () => {
  it("finds the first page", () => {
    expect(pageIndex("welcome")).toBe(0);
  });

  it("finds a middle page", () => {
    expect(pageIndex("explore")).toBe(2);
  });

  it("finds the last page", () => {
    expect(pageIndex(IGDB_PAGE_ID)).toBe(3);
  });

  it("resolves an unknown selection to 0 rather than -1", () => {
    // Undocumented until now: `onboarding-screen.tsx` feeds this straight into
    // `nextPageId`, so an id the native view reports that we don't have reads
    // as page 0 — the button below it would say "Continue", not "Start".
    expect(pageIndex("no-such-page")).toBe(0);
  });
});

describe("nextPageId", () => {
  it("gives the first page's successor", () => {
    expect(nextPageId("welcome")).toBe("backlog");
  });

  it("gives a middle page's successor", () => {
    expect(nextPageId("backlog")).toBe("explore");
  });

  it("gives undefined past the last page, the signal to complete instead of advance", () => {
    expect(nextPageId(IGDB_PAGE_ID)).toBeUndefined();
  });

  it("treats an unknown selection as page 0, so it still returns a next id", () => {
    expect(nextPageId("no-such-page")).toBe("backlog");
  });
});
