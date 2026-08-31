import { expect, it, vi } from "vitest";

import type { VideoRef } from "../src/share/canonicalise.js";
import { fetchVideoMeta, VideoGone, VideoMetaUnavailable } from "../src/share/oembed.js";

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

it("asks YouTube's endpoint about the page URL and returns title and author", async () => {
  const fetchImpl = vi.fn(async () =>
    json({
      title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
      author_name: "Snamwiches",
    }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(YOUTUBE, fetchImpl)).toEqual({
    title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
    author: "Snamwiches",
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
