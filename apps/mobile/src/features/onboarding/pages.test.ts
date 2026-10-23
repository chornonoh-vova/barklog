import { BACKLOG_STATUSES } from "@repo/contracts";

import { IGDB_PAGE_ID, nextPageId, ONBOARDING_PAGES, pageIndex } from "@/features/onboarding/pages";
import { i18n } from "@/lib/i18n/instance";

const title = (page: (typeof ONBOARDING_PAGES)[number]) => i18n.t(page.titleKey);
const description = (page: (typeof ONBOARDING_PAGES)[number] | undefined) =>
  page === undefined ? undefined : i18n.t(page.descriptionKey);

describe("ONBOARDING_PAGES", () => {
  it("is the five pages, in the agreed order", () => {
    expect(ONBOARDING_PAGES.map(title)).toEqual([
      "Welcome to Barklog",
      "Managing your game backlog",
      "Exploring games",
      "Share a video, pick the game",
      "All game data is powered by IGDB",
    ]);
  });

  it("gives every page a unique id", () => {
    const ids = ONBOARDING_PAGES.map((page) => page.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every page copy to show", () => {
    for (const page of ONBOARDING_PAGES) {
      expect(title(page).length).toBeGreaterThan(0);
      expect(description(page)?.length).toBeGreaterThan(0);
      expect(page.systemImage.length).toBeGreaterThan(0);
    }
  });

  it("ends on the IGDB attribution", () => {
    expect(ONBOARDING_PAGES.at(-1)?.id).toBe(IGDB_PAGE_ID);
  });

  it("names every real backlog status on the backlog page", () => {
    // A word-boundary regex, not `toContain`: "playing" contains "play", so a
    // substring check would survive the rename this guards against.
    const page = ONBOARDING_PAGES.find((candidate) => candidate.id === "backlog");

    expect(page).toBeDefined();

    for (const status of BACKLOG_STATUSES) {
      expect(description(page)?.toLowerCase()).toMatch(new RegExp(`\\b${status}\\b`));
    }
  });

  it("names both launch platforms on the share page", () => {
    const page = ONBOARDING_PAGES.find((candidate) => candidate.id === "share");

    expect(description(page)).toContain("YouTube");
    expect(description(page)).toContain("TikTok");
  });

  it("emphasizes the user's choice on the share page, not automatic resolution", () => {
    // `\b` guards against matching inside a longer word like "picked" or
    // "nitpick" — it does not detect automatic-add copy.
    const page = ONBOARDING_PAGES.find((candidate) => candidate.id === "share");

    expect(description(page)).toMatch(/\b(pick|choose|select)\b/i);
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
    expect(pageIndex(IGDB_PAGE_ID)).toBe(4);
  });

  it("resolves an unknown selection to 0 rather than -1", () => {
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

  it("puts the share page between explore and the attribution", () => {
    expect(nextPageId("explore")).toBe("share");
    expect(nextPageId("share")).toBe(IGDB_PAGE_ID);
  });

  it("treats an unknown selection as page 0, so it still returns a next id", () => {
    expect(nextPageId("no-such-page")).toBe("backlog");
  });
});

describe("onboarding illustrations", () => {
  it("gives each feature page the mascot that matches it", () => {
    const illustrationFor = (id: string) =>
      ONBOARDING_PAGES.find((page) => page.id === id)?.illustration;

    expect(illustrationFor("welcome")).toBe("default");
    expect(illustrationFor("backlog")).toBe("backlog");
    expect(illustrationFor("explore")).toBe("explore");
    expect(illustrationFor("share")).toBe("share");
  });

  it("leaves the attribution page on its symbol, having no mascot for it", () => {
    const page = ONBOARDING_PAGES.find((candidate) => candidate.id === IGDB_PAGE_ID);

    expect(page?.illustration).toBeUndefined();
    expect(page?.systemImage).toBe("books.vertical.fill");
  });
});
