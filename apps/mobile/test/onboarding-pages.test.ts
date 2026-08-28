import { BACKLOG_STATUSES } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { IGDB_PAGE_ID, ONBOARDING_PAGES } from "@/features/onboarding/pages";

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
    const page = ONBOARDING_PAGES.find((candidate) => candidate.id === "backlog");

    expect(page).toBeDefined();

    for (const status of BACKLOG_STATUSES) {
      expect(page?.description.toLowerCase()).toContain(status);
    }
  });
});
