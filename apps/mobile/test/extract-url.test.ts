import { describe, expect, it } from "vitest";

import { sharedUrlFrom } from "@/features/share/extract-url";

describe("sharedUrlFrom", () => {
  it("reads a website payload's contentUri, which is how YouTube shares", () => {
    expect(
      sharedUrlFrom([
        { contentType: "website", contentUri: "https://www.youtube.com/watch?v=1vs0lLIRt7w" },
      ]),
    ).toBe("https://www.youtube.com/watch?v=1vs0lLIRt7w");
  });

  it("pulls the url out of a text payload, which is how TikTok shares", () => {
    expect(
      sharedUrlFrom([
        {
          contentType: "text",
          value: "Check this out https://vm.tiktok.com/ZMabcdef/ so good #residentevil",
        },
      ]),
    ).toBe("https://vm.tiktok.com/ZMabcdef/");
  });

  it("takes the first payload that yields a url", () => {
    expect(
      sharedUrlFrom([
        { contentType: "text", value: "no link here" },
        { contentType: "website", contentUri: "https://youtu.be/1vs0lLIRt7w" },
      ]),
    ).toBe("https://youtu.be/1vs0lLIRt7w");
  });

  it("strips trailing punctuation a sentence leaves on the url", () => {
    expect(
      sharedUrlFrom([{ contentType: "text", value: "watch (https://youtu.be/abcdefghijk)." }]),
    ).toBe("https://youtu.be/abcdefghijk");
  });

  it("is null for no payloads, an empty payload, or a payload with no url", () => {
    expect(sharedUrlFrom([])).toBeNull();
    expect(sharedUrlFrom([{ contentType: "text", value: "" }])).toBeNull();
    expect(sharedUrlFrom([{ contentType: "image", contentUri: "file:///tmp/a.png" }])).toBeNull();
  });

  /** `useIdentifyShare` gates on `url !== null`, so an empty string would pass
   * the gate and cache a response under the not-yet-resolved key. */
  it("is null, never an empty string, for a blank website contentUri", () => {
    expect(sharedUrlFrom([{ contentType: "website", contentUri: "" }])).toBeNull();
  });
});
