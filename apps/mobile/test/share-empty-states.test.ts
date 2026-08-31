import { describe, expect, it } from "vitest";

import { NO_LINK, SHARED_LANDING, UNREADABLE, noMatch } from "@/features/share/empty-states";

describe("NO_LINK", () => {
  it("is the state for a share that resolved with no link in it", () => {
    expect(NO_LINK.title).not.toBe("");
    expect(NO_LINK.systemImage).not.toBe("");
    expect(NO_LINK.description).toMatch(/YouTube/);
    expect(NO_LINK.description).toMatch(/TikTok/);
  });
});

describe("UNREADABLE", () => {
  it("is the state for a share whose payload never resolved", () => {
    expect(UNREADABLE.title).not.toBe("");
    expect(UNREADABLE.systemImage).not.toBe("");
    expect(UNREADABLE.description).not.toBe("");
  });

  /** The NO_LINK advice — share the video, not a screenshot — is wrong when the
   * cause is a failed resolution, so the two must not be interchangeable. */
  it("does not give NO_LINK's advice, which would be wrong for this cause", () => {
    expect(UNREADABLE.title).not.toBe(NO_LINK.title);
    expect(UNREADABLE.description).not.toBe(NO_LINK.description);
    expect(UNREADABLE.description).not.toMatch(/screenshot/);
  });
});

describe("SHARED_LANDING", () => {
  it("offers the way out of the screen the sheet floats above", () => {
    expect(SHARED_LANDING.title).not.toBe("");
    expect(SHARED_LANDING.systemImage).not.toBe("");
    expect(SHARED_LANDING.description).toMatch(/home/);
  });
});

describe("noMatch", () => {
  it("says only that it could not tell when there is no guess", () => {
    const state = noMatch([]);

    expect(state.description).toBe("We could not tell which game this video is about.");
  });

  it("names a single guess", () => {
    expect(noMatch(["Resident Evil 4"]).description).toBe(
      "We think this is about Resident Evil 4, but it is not in the catalogue yet.",
    );
  });

  it("joins several guesses into one sentence", () => {
    expect(noMatch(["Hollow Knight", "Silksong"]).description).toBe(
      "We think this is about Hollow Knight or Silksong, but it is not in the catalogue yet.",
    );
  });

  it("reads differently from the other states, which are different situations", () => {
    const titles = [noMatch([]).title, NO_LINK.title, UNREADABLE.title, SHARED_LANDING.title];

    expect(new Set(titles).size).toBe(titles.length);
  });
});
