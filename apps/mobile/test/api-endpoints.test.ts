import { describe, expect, it, vi } from "vitest";

import { createEndpoints } from "@/api/endpoints";
import type { Request } from "@/api/client";

function spy() {
  const calls: { path: string; options: unknown }[] = [];
  const request = vi.fn(async (path: string, options?: unknown) => {
    calls.push({ path, options: options ?? {} });
    return {} as never;
  }) as unknown as Request;

  return { request, calls };
}

describe("createEndpoints", () => {
  it("searches games", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).searchGames({ q: "zelda", limit: 20, offset: 0 });

    expect(calls[0]).toEqual({
      path: "/api/games/search",
      options: { query: { q: "zelda", limit: 20, offset: 0 } },
    });
  });

  it("puts the feed in the path, with a default limit", async () => {
    const { request, calls } = spy();
    const endpoints = createEndpoints(request);

    await endpoints.gameFeed("popular");
    await endpoints.gameFeed("upcoming");
    await endpoints.gameFeed("recent");

    expect(calls.map((call) => call.path)).toEqual([
      "/api/games/popular",
      "/api/games/upcoming",
      "/api/games/recent",
    ]);
    expect(calls[0]?.options).toEqual({ query: { limit: 20 } });
  });

  it("fetches one game by id", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).getGame(1942);

    expect(calls[0]).toEqual({ path: "/api/games/1942", options: {} });
  });

  it("fetches similar games with a default limit of twelve", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).similarGames(1942);

    expect(calls[0]).toEqual({
      path: "/api/games/1942/similar",
      options: { query: { limit: 12 } },
    });
  });

  it("passes an explicit similar-games limit through", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).similarGames(1942, { limit: 6 });

    expect(calls[0]?.options).toEqual({ query: { limit: 6 } });
  });

  it("lists the backlog with the default sort and no status filter", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).listBacklog();

    expect(calls[0]).toEqual({
      path: "/api/backlog",
      options: { query: { status: undefined, sort: "updated_at" } },
    });
  });

  it("lists the backlog filtered by status", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).listBacklog({ status: "playing" });

    expect(calls[0]).toEqual({
      path: "/api/backlog",
      options: { query: { status: "playing", sort: "updated_at" } },
    });
  });

  it("fetches stats", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).getBacklogStats();

    expect(calls[0]).toEqual({ path: "/api/backlog/stats", options: {} });
  });

  it("upserts an entry with PUT", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).upsertBacklogEntry(1942, { status: "completed", rating: 9 });

    expect(calls[0]).toEqual({
      path: "/api/backlog/1942",
      options: { method: "PUT", body: { status: "completed", rating: 9 } },
    });
  });

  it("sends rating: null when a rating is cleared", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).upsertBacklogEntry(1942, { status: "waiting", rating: null });

    expect(calls[0]).toEqual({
      path: "/api/backlog/1942",
      options: { method: "PUT", body: { status: "waiting", rating: null } },
    });
  });

  it("deletes an entry", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).deleteBacklogEntry(1942);

    expect(calls[0]).toEqual({ path: "/api/backlog/1942", options: { method: "DELETE" } });
  });

  it("posts a share link to identify, with a default limit", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).identifyShare({
      url: "https://www.youtube.com/watch?v=1vs0lLIRt7w",
    });

    expect(calls[0]).toEqual({
      path: "/api/games/identify",
      options: {
        method: "POST",
        body: { url: "https://www.youtube.com/watch?v=1vs0lLIRt7w", limit: 15 },
      },
    });
  });

  it("passes an explicit identify limit through", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).identifyShare({ url: "https://youtu.be/x", limit: 5 });

    expect(calls[0]?.options).toEqual({
      method: "POST",
      body: { url: "https://youtu.be/x", limit: 5 },
    });
  });

  it("reads the entitlement route", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).getMe();

    expect(calls[0]).toEqual({ path: "/api/me", options: {} });
  });

  it("posts to refresh, because it makes the server re-read RevenueCat", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).refreshSubscription();

    expect(calls[0]).toEqual({
      path: "/api/subscription/refresh",
      options: { method: "POST", body: {} },
    });
  });
});
