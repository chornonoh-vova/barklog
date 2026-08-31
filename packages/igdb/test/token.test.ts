import { expect, test, vi } from "vitest";

import { createTokenSource } from "../src/token.js";

function fakeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async <T>(key: string) => (store.get(key) as T) ?? null,
    set: async (key: string, value: unknown) => void store.set(key, value),
  };
}

function tokenResponse(accessToken: string, expiresIn = 5_000_000) {
  return new Response(
    JSON.stringify({ access_token: accessToken, expires_in: expiresIn, token_type: "bearer" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("fetches a token from Twitch with client credentials", async () => {
  const cache = fakeCache();
  const fetchImpl = vi.fn(async () => tokenResponse("tok_abc"));

  const source = createTokenSource({
    clientId: "cid",
    clientSecret: "secret",
    cache,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  expect(await source.get()).toBe("tok_abc");

  const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
  expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/token");
  expect(url.searchParams.get("client_id")).toBe("cid");
  expect(url.searchParams.get("grant_type")).toBe("client_credentials");
});

test("caches the token in Valkey with an hour of headroom", async () => {
  const cache = fakeCache();
  const setSpy = vi.spyOn(cache, "set");
  const fetchImpl = vi.fn(async () => tokenResponse("tok_abc", 5_000_000));

  const source = createTokenSource({
    clientId: "cid",
    clientSecret: "secret",
    cache,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  await source.get();

  expect(setSpy).toHaveBeenCalledWith("igdb:token", "tok_abc", 5_000_000 - 3600);
});

test("a cached token short-circuits the network entirely", async () => {
  const cache = fakeCache();
  cache.store.set("igdb:token", "tok_cached");
  const fetchImpl = vi.fn(async () => tokenResponse("tok_fresh"));

  const source = createTokenSource({
    clientId: "cid",
    clientSecret: "secret",
    cache,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  expect(await source.get()).toBe("tok_cached");
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("a second call in the same process reuses the in-memory token", async () => {
  const fetchImpl = vi.fn(async () => tokenResponse("tok_abc"));
  const deadCache = {
    get: async () => null,
    set: async () => {},
  };

  const source = createTokenSource({
    clientId: "cid",
    clientSecret: "secret",
    cache: deadCache,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  await source.get();
  await source.get();

  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a Twitch failure surfaces as an error", async () => {
  const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));

  const source = createTokenSource({
    clientId: "cid",
    clientSecret: "bad",
    cache: fakeCache(),
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  await expect(source.get()).rejects.toThrow(/401/);
});
