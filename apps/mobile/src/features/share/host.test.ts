import { expect, test } from "vitest";

import { displayHost } from "@/features/share/host";

test("strips a leading www", () => {
  expect(displayHost("https://www.ign.com/articles/a")).toBe("ign.com");
  expect(displayHost("https://www.youtube.com/watch?v=a")).toBe("youtube.com");
});

test("leaves other subdomains alone", () => {
  expect(displayHost("https://store.steampowered.com/app/1")).toBe("store.steampowered.com");
});

test("lowercases the host", () => {
  expect(displayHost("https://WWW.IGN.COM/a")).toBe("ign.com");
});

test("falls back to the raw string when it will not parse", () => {
  expect(displayHost("not a url")).toBe("not a url");
});

test("does not collapse to an empty label when the host is exactly www.", () => {
  expect(displayHost("https://www./a")).toBe("www.");
});

test("leaves a punycode host as the navigable form, since that is what the tap opens", () => {
  expect(displayHost("https://www.xn--fsq.xn--0zwm56d/a")).toBe("xn--fsq.xn--0zwm56d");
});
