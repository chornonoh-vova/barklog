import { expect, it, test, vi } from "vitest";

import type { VideoRef } from "../src/share/canonicalise.js";
import {
  fetchOembed,
  fetchVideoMeta,
  SourceGone,
  SourceUnavailable,
  VideoGone,
  VideoMetaUnavailable,
} from "../src/share/oembed.js";

const PUBLIC = async () => [{ address: "93.184.216.34", family: 4 as const }];

const YOUTUBE: VideoRef = {
  provider: "youtube",
  videoId: "1vs0lLIRt7w",
  pageUrl: "https://www.youtube.com/watch?v=1vs0lLIRt7w",
};

const TIKTOK: VideoRef = {
  provider: "tiktok",
  videoId: "7123456789012345678",
  pageUrl: "https://www.tiktok.com/@snam/video/7123456789012345678",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

it("asks YouTube's endpoint about the page URL and returns title, author and thumbnail", async () => {
  const fetchImpl = vi.fn(async () =>
    json({
      title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
      author_name: "Snamwiches",
      thumbnail_url: "https://i.ytimg.com/vi/1vs0lLIRt7w/hqdefault.jpg",
    }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(YOUTUBE, fetchImpl)).toEqual({
    title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
    author: "Snamwiches",
    thumbnailUrl: "https://i.ytimg.com/vi/1vs0lLIRt7w/hqdefault.jpg",
  });

  const [calledUrl] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(calledUrl)).toBe(
    "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D1vs0lLIRt7w&format=json",
  );
});

it("asks TikTok's endpoint, and tolerates a missing author", async () => {
  const fetchImpl = vi.fn(async () =>
    json({ title: "beating this boss #residentevil" }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(TIKTOK, fetchImpl)).toEqual({
    title: "beating this boss #residentevil",
    author: null,
    thumbnailUrl: null,
  });
  expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain("tiktok.com/oembed");
});

it("tolerates a null author_name, not just a missing one", async () => {
  const fetchImpl = vi.fn(async () =>
    json({ title: "beating this boss #residentevil", author_name: null }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(TIKTOK, fetchImpl)).toEqual({
    title: "beating this boss #residentevil",
    author: null,
    thumbnailUrl: null,
  });
});

it.each([401, 403, 404])("treats %i as a gone video, not an outage", async (status) => {
  const fetchImpl = vi.fn(async () => json({}, status)) as unknown as typeof fetch;

  await expect(fetchVideoMeta(YOUTUBE, fetchImpl)).rejects.toThrow(VideoGone);
});

it("treats a 500 as an outage", async () => {
  const fetchImpl = vi.fn(async () => json({}, 500)) as unknown as typeof fetch;

  await expect(fetchVideoMeta(YOUTUBE, fetchImpl)).rejects.toThrow(VideoMetaUnavailable);
});

it("rejects a 200 whose body does not match the schema, rather than passing undefined on", async () => {
  const fetchImpl = vi.fn(async () => json({ status_code: 10101 })) as unknown as typeof fetch;

  await expect(fetchVideoMeta(TIKTOK, fetchImpl)).rejects.toThrow(VideoMetaUnavailable);
});

it("rejects an empty title, which TikTok returns for a removed video", async () => {
  const fetchImpl = vi.fn(async () => json({ title: "   " })) as unknown as typeof fetch;

  await expect(fetchVideoMeta(TIKTOK, fetchImpl)).rejects.toThrow(VideoMetaUnavailable);
});

it("drops a non-string thumbnail_url instead of failing the parse", async () => {
  const fetchImpl = vi.fn(async () =>
    json({ title: "beating this boss #residentevil", thumbnail_url: { url: "nope" } }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(TIKTOK, fetchImpl)).toEqual({
    title: "beating this boss #residentevil",
    author: null,
    thumbnailUrl: null,
  });
});

it("drops an unparseable thumbnail_url instead of failing the parse", async () => {
  const fetchImpl = vi.fn(async () =>
    json({ title: "beating this boss #residentevil", thumbnail_url: "not a url" }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(TIKTOK, fetchImpl)).toEqual({
    title: "beating this boss #residentevil",
    author: null,
    thumbnailUrl: null,
  });
});

it("drops a non-https thumbnail_url, which is handed to the client to load", async () => {
  const fetchImpl = vi.fn(async () =>
    json({
      title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
      author_name: "Snamwiches",
      thumbnail_url: "http://i.ytimg.com/vi/1vs0lLIRt7w/hqdefault.jpg",
    }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(YOUTUBE, fetchImpl)).toEqual({
    title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
    author: "Snamwiches",
    thumbnailUrl: null,
  });
});

// --- fetchOembed: the ladder's first rung, used by any provider Task 5's ---
// --- snapshot knows about, not just YouTube/TikTok. --------------------

const ENDPOINT = "https://www.youtube.com/oembed";
const PAGE = "https://www.youtube.com/watch?v=1vs0lLIRt7w";

function ok(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const deadline = () => Date.now() + 8_000;

test("reads title, author, provider and thumbnail dimensions", async () => {
  const fetchImpl = vi.fn(async () =>
    ok({
      title: "  Can You Beat Resident Evil 2 WITHOUT Killing Anything?  ",
      author_name: " Snamwiches ",
      provider_name: "YouTube",
      thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg",
      thumbnail_width: 480,
      thumbnail_height: 360,
    }),
  );

  expect(
    await fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch, PUBLIC),
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
    ok({ title: "A", provider_name: "P", thumbnail_url: "http://cdn.test/a.jpg" }),
  );

  const meta = await fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch, PUBLIC);
  expect(meta.thumbnailUrl).toBeNull();
  expect(meta.thumbnailWidth).toBeNull();
});

test("treats a blank title as unavailable, which is TikTok's answer for a removed video", async () => {
  const fetchImpl = vi.fn(async () => ok({ title: "   ", provider_name: "TikTok" }));

  await expect(
    fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch, PUBLIC),
  ).rejects.toThrow(SourceUnavailable);
});

test.each([401, 403, 404])("maps %i to SourceGone", async (status) => {
  const fetchImpl = vi.fn(async () => new Response(null, { status }));

  await expect(
    fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch, PUBLIC),
  ).rejects.toThrow(SourceGone);
});

test("maps 500 to SourceUnavailable so the ladder can fall through", async () => {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

  await expect(
    fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch, PUBLIC),
  ).rejects.toThrow(SourceUnavailable);
});

test("maps a payload that does not match the schema to SourceUnavailable", async () => {
  const fetchImpl = vi.fn(async () => ok({ nope: true }));

  await expect(
    fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch, PUBLIC),
  ).rejects.toThrow(SourceUnavailable);
});

test("a network failure is unavailable, not a crash", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new Error("socket hang up");
  });

  await expect(
    fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch, PUBLIC),
  ).rejects.toThrow(SourceUnavailable);
});

test("falls back to the endpoint's own hostname when the payload carries no provider_name", async () => {
  const fetchImpl = vi.fn(async () => ok({ title: "A" }));

  const meta = await fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch, PUBLIC);
  expect(meta.provider).toBe("www.youtube.com");
});
