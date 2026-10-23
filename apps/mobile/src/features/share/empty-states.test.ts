import { describe, expect, it } from "vitest";

import { noLink, noMatch, unreadable } from "@/features/share/empty-states";

describe("noLink", () => {
  it("is the state for a share that resolved with no link in it", () => {
    expect(noLink().title).not.toBe("");
    expect(noLink().systemImage).not.toBe("");
    expect(noLink().description).toMatch(/web link/);
    expect(noLink().description).toMatch(/screenshot/);
  });
});

describe("unreadable", () => {
  it("is the state for a share whose payload never resolved", () => {
    expect(unreadable().title).not.toBe("");
    expect(unreadable().systemImage).not.toBe("");
    expect(unreadable().description).not.toBe("");
  });

  it("does not give noLink's advice, which would be wrong for this cause", () => {
    expect(unreadable().title).not.toBe(noLink().title);
    expect(unreadable().description).not.toBe(noLink().description);
    expect(unreadable().description).not.toMatch(/screenshot/);
  });
});

describe("noMatch", () => {
  it("says only that it could not tell when there is no guess", () => {
    const state = noMatch("title", []);

    expect(state.description).toBe("We couldn't tell which game this is about.");
  });

  it("names a single guess", () => {
    expect(noMatch("title", ["Resident Evil 4"]).description).toBe(
      "We think this is about Resident Evil 4, but it isn't in the catalogue yet.",
    );
  });

  it("joins several guesses into one sentence", () => {
    expect(noMatch("author", ["Hollow Knight", "Silksong"]).description).toBe(
      "We think this is about Hollow Knight or Silksong, but it isn't in the catalogue yet.",
    );
  });

  it("does not quote the raw title back as a game when extraction failed soft", () => {
    const state = noMatch("unavailable", ["Sekiro's 100% is actually miserable"]);

    expect(state.description).toBe("We couldn't tell which game this is about.");
    expect(state.description).not.toMatch(/Sekiro/);
  });

  it("points at the original page when even a web search could not tell", () => {
    const state = noMatch("none", []);

    expect(state.description).toMatch(/searching the web/);
    expect(state.description).toMatch(/original page/);
  });

  it("separates the model's dead end from an extraction that never ran", () => {
    expect(noMatch("none", []).description).not.toBe(noMatch("unavailable", []).description);
  });

  it("reads differently from the other states, which are different situations", () => {
    const titles = [noMatch("title", []).title, noLink().title, unreadable().title];

    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("share illustrations", () => {
  it("gives both share failure states the share mascot", () => {
    expect(noLink().illustration).toBe("share");
    expect(unreadable().illustration).toBe("share");
  });

  it("gives no-match the share mascot on every basis", () => {
    for (const basis of ["title", "unavailable", "none"] as const) {
      expect(noMatch(basis, ["Hollow Knight"]).illustration, basis).toBe("share");
    }
  });
});
