import { describe, expect, test, vi } from "vitest";

import { extractKey } from "../src/cache-keys.js";
import {
  createOpenAIClient,
  createTitleExtractor,
  EXTRACT_PROMPT_VERSION,
  MAX_GUESSES,
  parseExtraction,
  PASS_1_BASES,
  PASS_2_BASES,
} from "../src/share/extract.js";
import type { SourceMeta } from "../src/share/oembed.js";

const META: SourceMeta = {
  title: "THIS CHANGES EVERYTHING",
  author: "Some Channel",
  provider: "YouTube",
  pageUrl: "https://www.youtube.com/watch?v=1vs0lLIRt7w",
  shareId: "abc123",
  thumbnailUrl: null,
  thumbnailWidth: null,
  thumbnailHeight: null,
};

test("EXTRACT_PROMPT_VERSION is 3", () => {
  expect(EXTRACT_PROMPT_VERSION).toBe(3);
});

test("parses a well-formed pass 1 answer and trims the titles", () => {
  const raw = JSON.stringify({ titles: ["  Resident Evil 2 ", "Resident Evil 2 (1998)"], basis: "title" });

  expect(parseExtraction(raw, PASS_1_BASES)).toEqual({
    titles: ["Resident Evil 2", "Resident Evil 2 (1998)"],
    basis: "title",
  });
});

test("caps the list at MAX_GUESSES and drops empty strings", () => {
  const raw = JSON.stringify({ titles: ["A", "", "B", "C", "D"], basis: "author" });

  expect(parseExtraction(raw, PASS_1_BASES).titles).toEqual(["A", "B", "C"]);
});

test("collapses to none when the two fields disagree", () => {
  expect(parseExtraction(JSON.stringify({ titles: ["A"], basis: "none" }), PASS_1_BASES)).toEqual({
    titles: [],
    basis: "none",
  });

  expect(parseExtraction(JSON.stringify({ titles: [], basis: "title" }), PASS_1_BASES)).toEqual({
    titles: [],
    basis: "none",
  });
});

test("pass 1 refuses a pass-2-only basis, and pass 2 refuses a pass-1-only basis", () => {
  expect(() => parseExtraction(JSON.stringify({ titles: ["A"], basis: "web" }), PASS_1_BASES)).toThrow();
  expect(() => parseExtraction(JSON.stringify({ titles: ["A"], basis: "title" }), PASS_2_BASES)).toThrow();
});

test("pass 1 refuses the mobile-only 'channel' basis, since PASS_1_BASES must not contain it", () => {
  expect(PASS_1_BASES).not.toContain("channel");
  expect(() =>
    parseExtraction(JSON.stringify({ titles: ["A"], basis: "channel" }), PASS_1_BASES),
  ).toThrow();
});

test("throws on anything unparseable so it stays out of the cache", () => {
  expect(() => parseExtraction("not json", PASS_1_BASES)).toThrow();
  expect(() => parseExtraction(JSON.stringify({ titles: "A", basis: "title" }), PASS_1_BASES)).toThrow();
});

test("the constructed client carries a bounded timeout and retry budget, not the SDK's 10-minute/2-retry defaults", () => {
  const client = createOpenAIClient("k");

  expect(client.timeout).toBe(20_000);
  expect(client.maxRetries).toBe(1);
});

function stubClient(...outputs: string[]) {
  const create = vi.fn();
  for (const output of outputs) create.mockResolvedValueOnce({ output_text: output, usage: {} });

  return { create, client: { responses: { create } } as never };
}

test("stops after pass 1 when it names a game, without tools and at effort none", async () => {
  const { create, client } = stubClient(JSON.stringify({ titles: ["Elden Ring"], basis: "title" }));

  const extract = createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client });

  expect(await extract(META)).toEqual({ titles: ["Elden Ring"], basis: "title" });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]![0].tools).toBeUndefined();
  expect(create.mock.calls[0]![0].reasoning).toEqual({ effort: "none" });
  expect(create.mock.calls[0]![0].max_output_tokens).toBe(256);
});

test("does not show pass 1 the url, but does give it the author and site", async () => {
  const { create, client } = stubClient(JSON.stringify({ titles: ["Elden Ring"], basis: "title" }));

  await createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client })(META);

  expect(create.mock.calls[0]![0].input).not.toContain(META.pageUrl);
  expect(create.mock.calls[0]![0].input).toContain("Some Channel");
  expect(create.mock.calls[0]![0].input).toContain("YouTube");
});

test("pass 1's schema constrains basis to PASS_1_BASES, excluding channel and web", async () => {
  const { create, client } = stubClient(JSON.stringify({ titles: ["Elden Ring"], basis: "title" }));

  await createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client })(META);

  const format = create.mock.calls[0]![0].text.format;
  expect(format.schema.properties.basis.enum).toEqual(["title", "author", "none"]);
});

test("escalates to a searching pass 2 when pass 1 gives up", async () => {
  const { create, client } = stubClient(
    JSON.stringify({ titles: [], basis: "none" }),
    JSON.stringify({ titles: ["Silksong"], basis: "web" }),
  );

  const extract = createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client });

  expect(await extract(META)).toEqual({ titles: ["Silksong"], basis: "web" });
  expect(create).toHaveBeenCalledTimes(2);

  const second = create.mock.calls[1]![0];
  expect(second.input).toContain(META.pageUrl);
  expect(second.reasoning).toEqual({ effort: "low" });
  expect(second.tools).toEqual([{ type: "web_search", search_context_size: "low" }]);
  expect(second.max_output_tokens).toBe(1024);
  expect(second.text.format.schema.properties.basis.enum).toEqual(["web", "none"]);
});

test("pass 2's request carries its own zero-retry budget, since a retry would bill for a second web search", async () => {
  const { create, client } = stubClient(
    JSON.stringify({ titles: [], basis: "none" }),
    JSON.stringify({ titles: ["Silksong"], basis: "web" }),
  );

  await createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client })(META);

  expect(create.mock.calls[0]![1]).toBeUndefined();
  expect(create.mock.calls[1]![1]).toEqual({ maxRetries: 0 });
});

test("returns none when pass 2 also gives up", async () => {
  const { client } = stubClient(
    JSON.stringify({ titles: [], basis: "none" }),
    JSON.stringify({ titles: [], basis: "none" }),
  );

  expect(await createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client })(META)).toEqual({
    titles: [],
    basis: "none",
  });
});

test("does not run pass 2 at all when pass 1 succeeds via the author tier", async () => {
  const { create, client } = stubClient(JSON.stringify({ titles: ["Hollow Knight"], basis: "author" }));

  await createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client })(META);

  expect(create).toHaveBeenCalledTimes(1);
});

test("propagates a pass 2 failure so nothing is cached, rather than degrading to none", async () => {
  const create = vi
    .fn()
    .mockResolvedValueOnce({ output_text: JSON.stringify({ titles: [], basis: "none" }), usage: {} })
    .mockRejectedValueOnce(new Error("web search unavailable"));

  const client = { responses: { create } } as never;

  await expect(
    createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client })(META),
  ).rejects.toThrow("web search unavailable");
});

test("propagates a pass-2 answer that fails its own schema, rather than degrading to none", async () => {
  const { client } = stubClient(
    JSON.stringify({ titles: [], basis: "none" }),
    JSON.stringify({ titles: ["Silksong"], basis: "title" }),
  );

  await expect(
    createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client })(META),
  ).rejects.toThrow();
});

test("MAX_GUESSES bounds both passes", () => {
  expect(MAX_GUESSES).toBe(3);
});

describe("extractKey", () => {
  test("carries the prompt version, the model and the shareId, so none survives a change", () => {
    expect(extractKey(3, "gpt-5.4-mini", "abc123")).toBe("extract:v3:gpt-5.4-mini:abc123");
  });

  test("changes when the model changes", () => {
    expect(extractKey(3, "gpt-5.4-mini", "abc123")).not.toBe(extractKey(3, "gpt-5.4-nano", "abc123"));
  });

  test("changes when the prompt version changes", () => {
    expect(extractKey(1, "m", "abc123")).not.toBe(extractKey(2, "m", "abc123"));
  });

  test("changes when the shareId changes", () => {
    expect(extractKey(3, "m", "abc123")).not.toBe(extractKey(3, "m", "xyz789"));
  });
});
