import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  IDENTIFY_LIMIT_DEFAULT,
  isShareableUrl,
  shareHostProvider,
  shareIdentifySchema,
} from "../src/share.js";

const parse = (input: unknown) => v.safeParse(shareIdentifySchema, input);

describe("shareHostProvider", () => {
  it("recognises every YouTube shape a share sheet produces", () => {
    expect(shareHostProvider("https://www.youtube.com/watch?v=1vs0lLIRt7w")).toBe("youtube");
    expect(shareHostProvider("https://m.youtube.com/watch?v=1vs0lLIRt7w")).toBe("youtube");
    expect(shareHostProvider("https://youtu.be/1vs0lLIRt7w")).toBe("youtube");
    expect(shareHostProvider("https://www.youtube.com/shorts/abcdefghijk")).toBe("youtube");
  });

  it("recognises TikTok, long and short", () => {
    expect(shareHostProvider("https://www.tiktok.com/@user/video/7123456789012345678")).toBe(
      "tiktok",
    );
    expect(shareHostProvider("https://vm.tiktok.com/ZMabcdef/")).toBe("tiktok");
  });

  it("matches the host exactly, so a lookalike domain cannot pass", () => {
    expect(shareHostProvider("https://youtube.com.evil.test/watch?v=x")).toBeNull();
    expect(shareHostProvider("https://notyoutube.com/watch?v=x")).toBeNull();
    expect(shareHostProvider("https://evil.test/?u=https://youtube.com/watch?v=x")).toBeNull();
  });

  it("requires https, so a downgraded link cannot be fetched", () => {
    expect(shareHostProvider("http://www.youtube.com/watch?v=1vs0lLIRt7w")).toBeNull();
  });

  it("is null for anything unparseable", () => {
    expect(shareHostProvider("not a url")).toBeNull();
    expect(shareHostProvider("")).toBeNull();
  });
});

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

  it("rejects an unsupported host, naming the url field", () => {
    const result = parse({ url: "https://vimeo.com/12345" });

    expect(result.success).toBe(false);
    expect(result.issues?.map((issue) => v.getDotPath(issue))).toContain("url");
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
