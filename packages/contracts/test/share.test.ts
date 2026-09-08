import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  EXTRACTED_BASES,
  IDENTIFY_LIMIT_DEFAULT,
  isShareableUrl,
  shareIdentifySchema,
} from "../src/share.js";

const parse = (input: unknown) => v.safeParse(shareIdentifySchema, input);

describe("isShareableUrl", () => {
  it("accepts a plain https url", () => {
    expect(isShareableUrl("https://example.test/a")).toBe(true);
  });

  it("accepts the default https port spelled out explicitly", () => {
    expect(isShareableUrl("https://example.test:443/a")).toBe(true);
  });

  it("rejects http", () => {
    expect(isShareableUrl("http://example.test/a")).toBe(false);
  });

  it("rejects a non-standard port", () => {
    expect(isShareableUrl("https://example.test:8443/a")).toBe(false);
  });

  it("rejects embedded credentials", () => {
    expect(isShareableUrl("https://user:pass@example.test/a")).toBe(false);
  });

  it("rejects anything unparseable", () => {
    expect(isShareableUrl("not a url")).toBe(false);
    expect(isShareableUrl("")).toBe(false);
  });
});

describe("shareIdentifySchema", () => {
  it("accepts a YouTube link and fills the default limit", () => {
    const result = parse({ url: "https://www.youtube.com/watch?v=1vs0lLIRt7w" });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      url: "https://www.youtube.com/watch?v=1vs0lLIRt7w",
      limit: IDENTIFY_LIMIT_DEFAULT,
    });
  });

  it("trims surrounding whitespace, which a text share carries", () => {
    const result = parse({ url: "  https://youtu.be/1vs0lLIRt7w  " });

    expect(result.success).toBe(true);
    expect(result.output?.url).toBe("https://youtu.be/1vs0lLIRt7w");
  });

  it("accepts a link to a host that is neither YouTube nor TikTok, since any https link is shareable now", () => {
    const result = parse({ url: "https://vimeo.com/12345" });

    expect(result.success).toBe(true);
  });

  it("rejects a limit over the cap rather than clamping it", () => {
    expect(parse({ url: "https://youtu.be/1vs0lLIRt7w", limit: 500 }).success).toBe(false);
  });

  it("rejects an unknown key, so a typo is a 422 and not silently ignored", () => {
    expect(parse({ url: "https://youtu.be/1vs0lLIRt7w", limitt: 5 }).success).toBe(false);
  });

  it("rejects an http url through the schema, not only through the helper", () => {
    const result = parse({ url: "http://www.youtube.com/watch?v=1vs0lLIRt7w" });

    expect(result.success).toBe(false);
    expect(result.issues?.map((issue) => v.getDotPath(issue))).toContain("url");
  });
});

describe("EXTRACTED_BASES", () => {
  it("the basis tiers include the new author and web values", () => {
    expect(EXTRACTED_BASES).toContain("author");
    expect(EXTRACTED_BASES).toContain("web");
  });

  // Not yet removed: apps/api/test/identify-routes.test.ts still types an
  // extraction against "channel", even though mobile no longer branches on it.
  it("channel is still present until the api test suite stops relying on it too", () => {
    expect(EXTRACTED_BASES).toContain("channel");
  });
});
