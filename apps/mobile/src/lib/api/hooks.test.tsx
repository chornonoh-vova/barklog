import {
  FREE_ACTIVE_SLOTS,
  SEARCH_LIMIT_DEFAULT,
  SIMILAR_LIMIT_DEFAULT,
  type GameListResponse,
} from "@repo/contracts";
import { waitFor } from "@testing-library/react-native";
import { notificationAsync, NotificationFeedbackType } from "expo-haptics";
import { router } from "expo-router";
import { Alert } from "react-native";

import {
  useBacklog,
  useBacklogEntry,
  useGame,
  useGameFeed,
  useIdentifyShare,
  useIsPremium,
  useMe,
  usePremium,
  useSearchGames,
  useSimilarGames,
} from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/errors";
import { keys } from "@/lib/api/keys";
import {
  backlogEntry,
  backlogItem,
  backlogList,
  gameDetail,
  gameList,
  identifyResponse,
  me,
} from "@test/fixtures";
import { fakeEndpoints, renderHookWithProviders, testQueryClient } from "@test/render";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: "success" },
}));

let push: jest.SpyInstance;
let alert: jest.SpyInstance;

beforeEach(() => {
  push = jest.spyOn(router, "push").mockImplementation(() => undefined);
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

describe("useBacklog", () => {
  it("loads the whole backlog under the list key", async () => {
    const list = backlogList(backlogItem(1));
    const api = fakeEndpoints({ listBacklog: async () => list });
    const { result, queryClient } = await renderHookWithProviders(() => useBacklog(), { api });

    await waitFor(() => expect(result.current.data).toEqual(list));
    expect(queryClient.getQueryData(keys.backlog.list())).toEqual(list);
  });
});

describe("useGameFeed", () => {
  it("asks for the feed with the default limit", async () => {
    const api = fakeEndpoints({ gameFeed: async () => gameList(1) });
    const { result, queryClient } = await renderHookWithProviders(() => useGameFeed("popular"), {
      api,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.gameFeed).toHaveBeenCalledWith("popular", { limit: SEARCH_LIMIT_DEFAULT });
    expect(queryClient.getQueryData(keys.games.feed("popular", SEARCH_LIMIT_DEFAULT))).toEqual(
      gameList(1),
    );
  });

  it("passes a caller's limit through", async () => {
    const api = fakeEndpoints({ gameFeed: async () => gameList(1) });
    const { result } = await renderHookWithProviders(() => useGameFeed("upcoming", 5), { api });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.gameFeed).toHaveBeenCalledWith("upcoming", { limit: 5 });
  });
});

describe("useSearchGames", () => {
  it("does not search below the minimum query length", async () => {
    const api = fakeEndpoints({ searchGames: async () => gameList(1) });
    const { result } = await renderHookWithProviders(() => useSearchGames("h"), { api });

    expect(result.current.fetchStatus).toBe("idle");
    expect(api.searchGames).not.toHaveBeenCalled();
  });

  it("searches once the query is long enough", async () => {
    const api = fakeEndpoints({ searchGames: async () => gameList(1) });
    const { result, queryClient } = await renderHookWithProviders(() => useSearchGames("ha"), {
      api,
    });

    await waitFor(() => expect(result.current.data).toEqual(gameList(1)));
    expect(api.searchGames).toHaveBeenCalledWith({ q: "ha", limit: SEARCH_LIMIT_DEFAULT });
    expect(queryClient.getQueryData(keys.games.search("ha", SEARCH_LIMIT_DEFAULT, 0))).toEqual(
      gameList(1),
    );
  });

  it("keeps the previous results on screen while the next query loads", async () => {
    let resolveNext!: (value: GameListResponse) => void;
    const api = fakeEndpoints({
      searchGames: async ({ q }: { q: string }) =>
        q === "ha" ? gameList(1) : new Promise((resolve) => (resolveNext = resolve)),
    } as never);
    const { result, rerender } = await renderHookWithProviders(
      ({ q }: { q: string }) => useSearchGames(q, 5),
      { api, initialProps: { q: "ha" } },
    );
    await waitFor(() => expect(result.current.data).toEqual(gameList(1)));

    await rerender({ q: "had" });

    expect(result.current.data).toEqual(gameList(1));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(api.searchGames).toHaveBeenLastCalledWith({ q: "had", limit: 5 });

    resolveNext(gameList(2));
    await waitFor(() => expect(result.current.data).toEqual(gameList(2)));
  });
});

describe("useGame", () => {
  it("loads one game's details", async () => {
    const api = fakeEndpoints({ getGame: async () => gameDetail({ id: 7 }) });
    const { result, queryClient } = await renderHookWithProviders(() => useGame(7), { api });

    await waitFor(() => expect(result.current.data?.id).toBe(7));
    expect(api.getGame).toHaveBeenCalledWith(7);
    expect(queryClient.getQueryData(keys.games.detail(7))).toEqual(gameDetail({ id: 7 }));
  });
});

describe("useSimilarGames", () => {
  it("loads similar games with the default limit", async () => {
    const api = fakeEndpoints({ similarGames: async () => gameList(2, 3) });
    const { result, queryClient } = await renderHookWithProviders(() => useSimilarGames(7), {
      api,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.similarGames).toHaveBeenCalledWith(7, { limit: SIMILAR_LIMIT_DEFAULT });
    expect(queryClient.getQueryData(keys.games.similar(7, SIMILAR_LIMIT_DEFAULT))).toEqual(
      gameList(2, 3),
    );
  });

  it("passes a caller's limit through", async () => {
    const api = fakeEndpoints({ similarGames: async () => gameList(2) });
    const { result } = await renderHookWithProviders(() => useSimilarGames(7, 3), { api });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.similarGames).toHaveBeenCalledWith(7, { limit: 3 });
  });
});

describe("useIdentifyShare", () => {
  it("waits for a shared url", async () => {
    const api = fakeEndpoints({ identifyShare: async () => identifyResponse() });
    const { result } = await renderHookWithProviders(() => useIdentifyShare(null), { api });

    expect(result.current.fetchStatus).toBe("idle");
    expect(api.identifyShare).not.toHaveBeenCalled();
  });

  it("sends an empty url, never null, if forced to fetch before one resolves", async () => {
    const api = fakeEndpoints({ identifyShare: async () => identifyResponse() });
    const { result } = await renderHookWithProviders(() => useIdentifyShare(null), { api });

    await result.current.refetch();

    expect(api.identifyShare).toHaveBeenCalledWith({ url: "" });
  });

  it("identifies the url once it has one, and keeps the answer fresh", async () => {
    const url = "https://www.youtube.com/watch?v=abc";
    const api = fakeEndpoints({ identifyShare: async () => identifyResponse() });
    const { result, queryClient } = await renderHookWithProviders(() => useIdentifyShare(url), {
      api,
    });

    await waitFor(() => expect(result.current.data).toEqual(identifyResponse()));
    expect(api.identifyShare).toHaveBeenCalledWith({ url });
    expect(result.current.isStale).toBe(false);
    expect(queryClient.getQueryData(keys.games.identify(url))).toEqual(identifyResponse());
  });
});

describe("useMe, usePremium and useIsPremium", () => {
  it("reads the entitlement from /me", async () => {
    const api = fakeEndpoints({ getMe: async () => me({ premium: true }) });
    const { result } = await renderHookWithProviders(
      () => ({ me: useMe(), premium: usePremium(), isPremium: useIsPremium() }),
      { api },
    );

    await waitFor(() => expect(result.current.premium).toBe(true));
    expect(result.current.me.data).toEqual(me({ premium: true }));
    expect(result.current.isPremium).toBe(true);
  });

  it("reports an unknown entitlement as unknown, and displays it as free", async () => {
    const api = fakeEndpoints({ getMe: () => new Promise(() => {}) });
    const { result } = await renderHookWithProviders(
      () => ({ premium: usePremium(), isPremium: useIsPremium() }),
      { api },
    );

    expect(result.current.premium).toBeUndefined();
    expect(result.current.isPremium).toBe(false);
  });
});

describe("useBacklogEntry", () => {
  /** A free user's cached `me` and list, so the slot check has what it needs. */
  function seeded(list = backlogList()) {
    const queryClient = testQueryClient();
    queryClient.setQueryData(keys.me(), me({ premium: false }));
    queryClient.setQueryData(keys.backlog.list(), list);
    return queryClient;
  }

  it("moves a game to a status, keeping its rating, with a haptic", async () => {
    const api = fakeEndpoints({
      upsertBacklogEntry: async () => backlogEntry({ gameId: 3, status: "playing" }),
    });
    const queryClient = seeded();
    const { result } = await renderHookWithProviders(() => useBacklogEntry(3), {
      api,
      queryClient,
    });

    result.current.move("playing");

    await waitFor(() =>
      expect(notificationAsync).toHaveBeenCalledWith(NotificationFeedbackType.Success),
    );
    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(3, { status: "playing" });
    expect(queryClient.getQueryState(keys.backlog.list())?.isInvalidated).toBe(true);
  });

  it("rates a game with its status", async () => {
    const api = fakeEndpoints({
      upsertBacklogEntry: async () => backlogEntry({ gameId: 3, status: "completed", rating: 4 }),
    });
    const queryClient = seeded(backlogList(backlogItem(3, "completed")));
    const { result } = await renderHookWithProviders(() => useBacklogEntry(3), {
      api,
      queryClient,
    });

    result.current.rate("completed", 4);

    await waitFor(() =>
      expect(queryClient.getQueryState(keys.backlog.list())?.isInvalidated).toBe(true),
    );
    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(3, { status: "completed", rating: 4 });
    // Same status: a rating alone plays no haptic.
    expect(notificationAsync).not.toHaveBeenCalled();
  });

  it("removes a game", async () => {
    const api = fakeEndpoints({ deleteBacklogEntry: async () => undefined });
    const { result } = await renderHookWithProviders(() => useBacklogEntry(3), {
      api,
      queryClient: seeded(backlogList(backlogItem(3))),
    });

    result.current.remove();

    await waitFor(() => expect(api.deleteBacklogEntry).toHaveBeenCalledWith(3));
  });

  it("alerts with the error's copy when a write fails", async () => {
    const api = fakeEndpoints({
      upsertBacklogEntry: async () => {
        throw new ApiError({ status: 0, type: "about:blank", title: "Network unavailable" });
      },
    });
    const { result } = await renderHookWithProviders(() => useBacklogEntry(3), {
      api,
      queryClient: seeded(),
    });

    result.current.move("waiting");

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "You're offline",
        "Barklog could not reach the server. Check your connection.",
      ),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("opens the paywall instead of writing when a free user has no spot left", async () => {
    const full = backlogList(
      ...Array.from({ length: FREE_ACTIVE_SLOTS }, (_, i) => backlogItem(i + 1, "playing")),
    );
    const api = fakeEndpoints();
    const { result } = await renderHookWithProviders(() => useBacklogEntry(99), {
      api,
      queryClient: seeded(full),
    });

    result.current.move("playing");
    result.current.rate("playing", 5);

    await waitFor(() => expect(push).toHaveBeenCalledTimes(2));
    expect(push).toHaveBeenCalledWith("/paywall");
    expect(api.upsertBacklogEntry).not.toHaveBeenCalled();
  });

  it("opens the paywall, without an alert, when the server refuses with 402", async () => {
    const api = fakeEndpoints({
      upsertBacklogEntry: async () => {
        throw new ApiError({
          status: 402,
          type: "about:blank",
          title: "Payment required",
          code: "backlog_cap_reached",
        });
      },
    });
    const { result } = await renderHookWithProviders(() => useBacklogEntry(3), {
      api,
      queryClient: seeded(),
    });

    result.current.move("playing");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/paywall"));
    expect(alert).not.toHaveBeenCalled();
  });

  it("keeps the same functions until the game changes", async () => {
    const { result, rerender } = await renderHookWithProviders(
      ({ id }: { id: number }) => useBacklogEntry(id),
      { initialProps: { id: 3 } },
    );
    const first = result.current;

    await rerender({ id: 3 });
    expect(result.current).toBe(first);

    await rerender({ id: 4 });
    expect(result.current).not.toBe(first);
  });
});
