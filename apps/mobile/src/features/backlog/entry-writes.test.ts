import { waitFor } from "@testing-library/react-native";
import {
  FREE_ACTIVE_SLOTS,
  type BacklogListItemWire,
  type BacklogListResponse,
  type BacklogStatus,
  type GameDetailResponse,
  type MeResponse,
} from "@repo/contracts";
import type { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/errors";
import { keys } from "@/lib/api/keys";
import { createEntryWrites, type EntryWrites } from "@/features/backlog/entry-writes";
import { testQueryClient } from "@test/render";

const STAMP = "2026-01-01T00:00:00.000Z";

const summary = (id: number) => ({
  id,
  name: `Game ${id}`,
  slug: `game-${id}`,
  coverImageId: null,
  firstReleaseDate: null,
  totalRating: null,
  totalRatingCount: 0,
});

const item = (gameId: number, status: BacklogStatus, rating: number | null = null) =>
  ({
    gameId,
    status,
    rating,
    addedAt: STAMP,
    updatedAt: STAMP,
    game: summary(gameId),
  }) satisfies BacklogListItemWire;

const detail = (
  id: number,
  entry: { status: BacklogStatus; rating: number | null } | null,
): GameDetailResponse => ({
  ...summary(id),
  summary: null,
  gameType: null,
  parentGame: null,
  screenshots: [],
  genres: [],
  platforms: [],
  developers: [],
  publishers: [],
  backlogEntry: entry === null ? null : { gameId: id, ...entry, addedAt: STAMP, updatedAt: STAMP },
});

const me = (premium: boolean): MeResponse => ({ premium, entitlement: null });

/** `FREE_ACTIVE_SLOTS` waiting entries, ids from 1. */
const fullList = (): BacklogListResponse => ({
  items: Array.from({ length: FREE_ACTIVE_SLOTS }, (_, i) => item(i + 1, "waiting")),
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

let queryClient: QueryClient;
let api: {
  upsertBacklogEntry: jest.MockedFunction<(gameId: number, input: unknown) => Promise<unknown>>;
  deleteBacklogEntry: jest.MockedFunction<(gameId: number) => Promise<unknown>>;
};
let effects: {
  openPaywall: jest.MockedFunction<() => void>;
  alertError: jest.MockedFunction<(error: unknown) => void>;
  playStatusHaptic: jest.MockedFunction<() => void>;
};
let writes: EntryWrites;

beforeEach(() => {
  queryClient = testQueryClient();
  api = {
    upsertBacklogEntry: jest.fn<Promise<unknown>, [number, unknown]>(async () => ({})),
    deleteBacklogEntry: jest.fn<Promise<unknown>, [number]>(async () => undefined),
  };
  effects = {
    openPaywall: jest.fn<void, []>(),
    alertError: jest.fn<void, [unknown]>(),
    playStatusHaptic: jest.fn<void, []>(),
  };
  writes = createEntryWrites(queryClient, api as never, effects);
});

afterEach(() => {
  jest.useRealTimers();
});

const getDetail = (id: number) =>
  queryClient.getQueryData<GameDetailResponse>(keys.games.detail(id));
const getList = () => queryClient.getQueryData<BacklogListResponse>(keys.backlog.list());

describe("createEntryWrites", () => {
  it("a move sends no rating, so the server keeps it", async () => {
    queryClient.setQueryData(keys.games.detail(1), detail(1, { status: "completed", rating: 8 }));

    await writes.move(1, "abandoned");

    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(1, { status: "abandoned" });
  });

  // No guess at what the server will say: the refetch shows the change.
  it("leaves the cache as is and refetches it once the server answers", async () => {
    const list = { items: [item(1, "waiting"), item(2, "playing")] };
    const game = detail(1, { status: "waiting", rating: null });
    queryClient.setQueryData(keys.backlog.list(), list);
    queryClient.setQueryData(keys.games.detail(1), game);
    const pending = deferred();
    api.upsertBacklogEntry.mockReturnValue(pending.promise);

    const done = writes.move(1, "completed");

    await waitFor(() => expect(api.upsertBacklogEntry).toHaveBeenCalled());
    expect(getList()).toBe(list);
    expect(getDetail(1)).toBe(game);
    expect(queryClient.getQueryState(keys.backlog.list())?.isInvalidated).toBe(false);

    pending.resolve();
    await done;

    expect(queryClient.getQueryState(keys.backlog.list())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.games.detail(1))?.isInvalidated).toBe(true);
  });

  it("a 402 opens the paywall without an alert", async () => {
    const list = { items: [item(1, "completed", 8)] };
    queryClient.setQueryData(keys.me(), me(false));
    queryClient.setQueryData(keys.backlog.list(), list);
    api.upsertBacklogEntry.mockRejectedValue(
      new ApiError({ status: 402, type: "about:blank", title: "Payment Required" }),
    );

    await writes.move(1, "playing");

    expect(getList()).toBe(list);
    expect(effects.openPaywall).toHaveBeenCalledTimes(1);
    expect(effects.alertError).not.toHaveBeenCalled();
    expect(effects.playStatusHaptic).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(keys.me())?.isInvalidated).toBe(true);
  });

  it("any other failure alerts", async () => {
    queryClient.setQueryData(keys.backlog.list(), { items: [item(1, "waiting")] });
    const error = new ApiError({ status: 500, type: "about:blank", title: "Server Error" });
    api.upsertBacklogEntry.mockRejectedValue(error);

    await writes.move(1, "playing");

    expect(effects.alertError).toHaveBeenCalledTimes(1);
    expect(effects.alertError).toHaveBeenCalledWith(error);
    expect(effects.openPaywall).not.toHaveBeenCalled();
    expect(effects.playStatusHaptic).not.toHaveBeenCalled();
  });

  it("the haptic plays once the server confirms a status change, not on a re-rate", async () => {
    queryClient.setQueryData(keys.games.detail(1), detail(1, { status: "waiting", rating: null }));
    const pending = deferred();
    api.upsertBacklogEntry.mockReturnValue(pending.promise);

    const moved = writes.move(1, "playing");

    await waitFor(() => expect(api.upsertBacklogEntry).toHaveBeenCalled());
    expect(effects.playStatusHaptic).not.toHaveBeenCalled();
    pending.resolve();
    await moved;
    expect(effects.playStatusHaptic).toHaveBeenCalledTimes(1);

    queryClient.setQueryData(keys.games.detail(1), detail(1, { status: "playing", rating: null }));
    api.upsertBacklogEntry.mockResolvedValue({});
    await writes.rate(1, "playing", 9);

    expect(effects.playStatusHaptic).toHaveBeenCalledTimes(1);
  });

  // Home acts without opening the game's page, so the list knows the old status.
  it("a re-rate from Home reads the old status from the list and stays quiet", async () => {
    queryClient.setQueryData(keys.backlog.list(), { items: [item(1, "completed", 8)] });

    await writes.rate(1, "completed", 5);

    expect(effects.playStatusHaptic).not.toHaveBeenCalled();
  });

  it("remove plays no haptic and refetches the backlog", async () => {
    queryClient.setQueryData(keys.backlog.list(), { items: [item(1, "waiting")] });

    await writes.remove(1);

    expect(api.deleteBacklogEntry).toHaveBeenCalledWith(1);
    expect(effects.playStatusHaptic).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(keys.backlog.list())?.isInvalidated).toBe(true);
  });
  it("a slot-consuming move at the cap opens the paywall and writes nothing", async () => {
    const list = fullList();
    const game = detail(99, null);
    queryClient.setQueryData(keys.me(), me(false));
    queryClient.setQueryData(keys.backlog.list(), list);
    queryClient.setQueryData(keys.games.detail(99), game);

    await writes.move(99, "playing");

    expect(effects.openPaywall).toHaveBeenCalledTimes(1);
    expect(api.upsertBacklogEntry).not.toHaveBeenCalled();
    expect(getList()).toBe(list);
    expect(getDetail(99)).toBe(game);
  });

  it("an unknown entitlement never blocks", async () => {
    queryClient.setQueryData(keys.backlog.list(), fullList());
    queryClient.setQueryData(keys.games.detail(99), detail(99, null));

    await writes.move(99, "playing");

    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(99, { status: "playing" });
    expect(effects.openPaywall).not.toHaveBeenCalled();
  });

  it("a cold list never blocks", async () => {
    queryClient.setQueryData(keys.me(), me(false));
    queryClient.setQueryData(keys.games.detail(99), detail(99, null));

    await writes.move(99, "playing");

    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(99, { status: "playing" });
    expect(effects.openPaywall).not.toHaveBeenCalled();
  });

  it("re-rating at the cap is never blocked", async () => {
    queryClient.setQueryData(keys.me(), me(false));
    queryClient.setQueryData(keys.backlog.list(), fullList());

    await writes.rate(1, "waiting", 7);

    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(1, { status: "waiting", rating: 7 });
    expect(effects.openPaywall).not.toHaveBeenCalled();
  });

  it("a settled write leaves no mutation in the cache once it is collectable", async () => {
    jest.useFakeTimers();
    // Node reads as a server to query-core, whose default gcTime is Infinity;
    // the device's is five minutes.
    queryClient.setDefaultOptions({ mutations: { retry: false, gcTime: 5 * 60_000 } });
    queryClient.setQueryData(keys.backlog.list(), { items: [item(1, "waiting")] });

    await writes.move(1, "playing");
    api.upsertBacklogEntry.mockRejectedValue(
      new ApiError({ status: 500, type: "about:blank", title: "Server Error" }),
    );
    await writes.rate(1, "playing", 5);
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(queryClient.getMutationCache().getAll()).toEqual([]);
  });
});
