import { expect, test, vi } from "vitest";

import { fetchOembed, SourceGone, SourceUnavailable } from "../src/share/oembed.js";
import { jsonResponse, PUBLIC_LOOKUP, testDeadline } from "./share-fixtures.js";

// fetchOembed: the ladder's first rung, used by any provider the vendored
// snapshot knows about, not just YouTube/TikTok.

const ENDPOINT = "https://www.youtube.com/oembed";
const PAGE = "https://www.youtube.com/watch?v=1vs0lLIRt7w";

test("reads title, author, provider and thumbnail dimensions", async () => {
  const fetchImpl = vi.fn(async () =>
    jsonResponse({
      title: "  Can You Beat Resident Evil 2 WITHOUT Killing Anything?  ",
      author_name: " Snamwiches ",
      provider_name: "YouTube",
      thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg",
      thumbnail_width: 480,
      thumbnail_height: 360,
    }),
  );

  expect(
    await fetchOembed(
      ENDPOINT,
      PAGE,
      testDeadline(),
      fetchImpl as unknown as typeof fetch,
      PUBLIC_LOOKUP,
    ),
  ).toEqual({
    title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
    author: "Snamwiches",
    provider: "YouTube",
    pageUrl: PAGE,
    thumbnailUrl: "https://i.ytimg.com/vi/x/hqdefault.jpg",
    thumbnailWidth: 480,
    thumbnailHeight: 360,
  });
});

test("drops a non-https thumbnail rather than forwarding it", async () => {
  const fetchImpl = vi.fn(async () =>
    jsonResponse({ title: "A", provider_name: "P", thumbnail_url: "http://cdn.test/a.jpg" }),
  );

  const meta = await fetchOembed(
    ENDPOINT,
    PAGE,
    testDeadline(),
    fetchImpl as unknown as typeof fetch,
    PUBLIC_LOOKUP,
  );
  expect(meta.thumbnailUrl).toBeNull();
  expect(meta.thumbnailWidth).toBeNull();
});

test("treats a blank title as unavailable, which is TikTok's answer for a removed video", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse({ title: "   ", provider_name: "TikTok" }));

  await expect(
    fetchOembed(
      ENDPOINT,
      PAGE,
      testDeadline(),
      fetchImpl as unknown as typeof fetch,
      PUBLIC_LOOKUP,
    ),
  ).rejects.toThrow(SourceUnavailable);
});

test.each([401, 403, 404])("maps %i to SourceGone", async (status) => {
  const fetchImpl = vi.fn(async () => new Response(null, { status }));

  await expect(
    fetchOembed(
      ENDPOINT,
      PAGE,
      testDeadline(),
      fetchImpl as unknown as typeof fetch,
      PUBLIC_LOOKUP,
    ),
  ).rejects.toThrow(SourceGone);
});

test("maps 500 to SourceUnavailable so the ladder can fall through", async () => {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

  await expect(
    fetchOembed(
      ENDPOINT,
      PAGE,
      testDeadline(),
      fetchImpl as unknown as typeof fetch,
      PUBLIC_LOOKUP,
    ),
  ).rejects.toThrow(SourceUnavailable);
});

test("maps a payload that does not match the schema to SourceUnavailable", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse({ nope: true }));

  await expect(
    fetchOembed(
      ENDPOINT,
      PAGE,
      testDeadline(),
      fetchImpl as unknown as typeof fetch,
      PUBLIC_LOOKUP,
    ),
  ).rejects.toThrow(SourceUnavailable);
});

test("a network failure is unavailable, not a crash", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new Error("socket hang up");
  });

  await expect(
    fetchOembed(
      ENDPOINT,
      PAGE,
      testDeadline(),
      fetchImpl as unknown as typeof fetch,
      PUBLIC_LOOKUP,
    ),
  ).rejects.toThrow(SourceUnavailable);
});

test("falls back to the endpoint's own hostname when the payload carries no provider_name", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse({ title: "A" }));

  const meta = await fetchOembed(
    ENDPOINT,
    PAGE,
    testDeadline(),
    fetchImpl as unknown as typeof fetch,
    PUBLIC_LOOKUP,
  );
  expect(meta.provider).toBe("www.youtube.com");
});
