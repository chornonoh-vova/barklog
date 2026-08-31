import { describe, expect, it } from "vitest";

import { extractKey } from "../src/cache-keys.js";
import { MAX_GUESSES, parseExtraction } from "../src/share/extract.js";

describe("parseExtraction", () => {
  it("reads the titles out of a well-formed response", () => {
    expect(parseExtraction('{"titles":["Resident Evil 2","Resident Evil"]}')).toEqual([
      "Resident Evil 2",
      "Resident Evil",
    ]);
  });

  it("caps the list, so a chatty response cannot fan out into extra searches", () => {
    const many = JSON.stringify({ titles: ["a", "b", "c", "d", "e"] });

    expect(parseExtraction(many)).toHaveLength(MAX_GUESSES);
  });

  it("drops blank entries and trims the rest", () => {
    expect(parseExtraction('{"titles":["  Hades  ","","   "]}')).toEqual(["Hades"]);
  });

  it("returns an empty list when the model found no game", () => {
    expect(parseExtraction('{"titles":[]}')).toEqual([]);
  });

  it("throws on unparseable output rather than returning nothing, so the caller can fail soft", () => {
    expect(() => parseExtraction("not json")).toThrow();
    expect(() => parseExtraction('{"games":["Hades"]}')).toThrow();
    expect(() => parseExtraction('{"titles":"Hades"}')).toThrow();
  });
});

describe("extractKey", () => {
  it("carries the prompt version and the model, so neither survives a change", () => {
    expect(extractKey(1, "claude-haiku-4-5", "youtube", "1vs0lLIRt7w")).toBe(
      "extract:v1:claude-haiku-4-5:youtube:1vs0lLIRt7w",
    );
  });

  it("changes when the model changes", () => {
    expect(extractKey(1, "claude-haiku-4-5", "youtube", "x")).not.toBe(
      extractKey(1, "claude-opus-5", "youtube", "x"),
    );
  });

  it("changes when the prompt version changes", () => {
    expect(extractKey(1, "m", "youtube", "x")).not.toBe(extractKey(2, "m", "youtube", "x"));
  });
});
