import { describe, expect, it } from "vitest";

import { NO_LINK, noMatch } from "@/features/share/empty-states";

describe("NO_LINK", () => {
  it("is the state for a share that resolved with no link in it", () => {
    expect(NO_LINK.title).not.toBe("");
    expect(NO_LINK.systemImage).not.toBe("");
    expect(NO_LINK.description).toMatch(/YouTube/);
    expect(NO_LINK.description).toMatch(/TikTok/);
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

  it("reads differently from the no-link state, which is a different failure", () => {
    expect(noMatch([]).title).not.toBe(NO_LINK.title);
  });
});
