import { describe, expect, it } from "vitest";

import { extractKey } from "../src/cache-keys.js";
import { MAX_GUESSES, parseExtraction } from "../src/share/extract.js";

describe("parseExtraction", () => {
  it("reads the titles and the basis out of a well-formed response", () => {
    expect(
      parseExtraction('{"titles":["Resident Evil 2","Resident Evil"],"basis":"title"}'),
    ).toEqual({ titles: ["Resident Evil 2", "Resident Evil"], basis: "title" });
  });

  it("keeps a channel-derived answer distinct from a title-derived one", () => {
    expect(parseExtraction('{"titles":["Elden Ring"],"basis":"channel"}')).toEqual({
      titles: ["Elden Ring"],
      basis: "channel",
    });
  });

  it("caps the list, so a chatty response cannot fan out into extra searches", () => {
    const many = JSON.stringify({ titles: ["a", "b", "c", "d", "e"], basis: "title" });

    expect(parseExtraction(many).titles).toHaveLength(MAX_GUESSES);
  });

  it("drops blank entries and trims the rest", () => {
    expect(parseExtraction('{"titles":["  Hades  ","","   "],"basis":"title"}').titles).toEqual([
      "Hades",
    ]);
  });

  it("returns an empty list when the model found no game", () => {
    expect(parseExtraction('{"titles":[],"basis":"none"}')).toEqual({ titles: [], basis: "none" });
  });

  it("collapses a basis of `none` that arrived with titles anyway, since it disclaims them", () => {
    expect(parseExtraction('{"titles":["Hades"],"basis":"none"}')).toEqual({
      titles: [],
      basis: "none",
    });
  });

  it("collapses a basis that arrived with no titles to back it", () => {
    expect(parseExtraction('{"titles":["","  "],"basis":"channel"}')).toEqual({
      titles: [],
      basis: "none",
    });
  });

  it("throws on unparseable output rather than returning nothing, so the caller can fail soft", () => {
    expect(() => parseExtraction("not json")).toThrow();
    expect(() => parseExtraction('{"games":["Hades"]}')).toThrow();
    expect(() => parseExtraction('{"titles":"Hades","basis":"title"}')).toThrow();
    expect(() => parseExtraction('{"titles":["Hades"]}')).toThrow();
    expect(() => parseExtraction('{"titles":["Hades"],"basis":"vibes"}')).toThrow();
  });
});

describe("extractKey", () => {
  it("carries the prompt version and the model, so neither survives a change", () => {
    expect(extractKey(2, "gpt-5.4-mini", "youtube", "1vs0lLIRt7w")).toBe(
      "extract:v2:gpt-5.4-mini:youtube:1vs0lLIRt7w",
    );
  });

  it("changes when the model changes", () => {
    expect(extractKey(2, "gpt-5.4-mini", "youtube", "x")).not.toBe(
      extractKey(2, "gpt-5.4-nano", "youtube", "x"),
    );
  });

  it("changes when the prompt version changes", () => {
    expect(extractKey(1, "m", "youtube", "x")).not.toBe(extractKey(2, "m", "youtube", "x"));
  });
});
