import {
  FREE_ACTIVE_SLOTS,
  type BacklogListItemWire,
  type BacklogListResponse,
  type BacklogStatus,
  type GameDetailResponse,
  type MeResponse,
} from "@repo/contracts";
import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError } from "@/api/errors";
import { keys } from "@/api/keys";
import { createEntryWrites, type EntryWrites } from "@/features/backlog/entry-writes";
import { createQueryClient } from "@/query-client";

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
  upsertBacklogEntry: Mock<(gameId: number, input: unknown) => Promise<unknown>>;
  deleteBacklogEntry: Mock<(gameId: number) => Promise<unknown>>;
};
let effects: {
  openPaywall: Mock<() => void>;
  alertError: Mock<(error: unknown) => void>;
  playStatusHaptic: Mock<() => void>;
};
let writes: EntryWrites;

beforeEach(() => {
  queryClient = createQueryClient();
  api = {
    upsertBacklogEntry: vi.fn(async () => ({})),
    deleteBacklogEntry: vi.fn(async () => undefined),
  };
  effects = {
    openPaywall: vi.fn<() => void>(),
    alertError: vi.fn<(error: unknown) => void>(),
    playStatusHaptic: vi.fn<() => void>(),
  };
  writes = createEntryWrites(queryClient, api as never, effects);
});

afterEach(() => {
  vi.useRealTimers();
});

const getDetail = (id: number) =>
  queryClient.getQueryData<GameDetailResponse>(keys.games.detail(id));
const getList = () => queryClient.getQueryData<BacklogListResponse>(keys.backlog.list());

describe("createEntryWrites", () => {
  it("a move keeps the cached rating and sends no rating", async () => {
    queryClient.setQueryData(keys.games.detail(1), detail(1, { status: "completed", rating: 8 }));
    const pending = deferred();
    api.upsertBacklogEntry.mockReturnValue(pending.promise);

    const done = writes.move(1, "abandoned");

    await vi.waitFor(() => expect(api.upsertBacklogEntry).toHaveBeenCalled());
    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(1, { status: "abandoned" });
    expect(getDetail(1)?.backlogEntry).toMatchObject({ status: "abandoned", rating: 8 });

    pending.resolve();
    await done;
  });

  it("a move patches the cached list at tap time", async () => {
    queryClient.setQueryData(keys.backlog.list(), {
      items: [item(1, "waiting"), item(2, "playing")],
    });
    const pending = deferred();
    api.upsertBacklogEntry.mockReturnValue(pending.promise);

    const done = writes.move(1, "completed");

    await vi.waitFor(() => expect(api.upsertBacklogEntry).toHaveBeenCalled());
    expect(getList()?.items.find((i) => i.gameId === 1)?.status).toBe("completed");

    pending.resolve();
    await done;
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

  it("a 402 rolls back and opens the paywall without an alert", async () => {
    const list = { items: [item(1, "completed", 8)] };
    const game = detail(1, { status: "completed", rating: 8 });
    queryClient.setQueryData(keys.me(), me(false));
    queryClient.setQueryData(keys.backlog.list(), list);
    queryClient.setQueryData(keys.games.detail(1), game);
    api.upsertBacklogEntry.mockRejectedValue(
      new ApiError({ status: 402, type: "about:blank", title: "Payment Required" }),
    );

    await writes.move(1, "playing");

    expect(getList()).toEqual(list);
    expect(getDetail(1)).toEqual(game);
    expect(effects.openPaywall).toHaveBeenCalledTimes(1);
    expect(effects.alertError).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(keys.me())?.isInvalidated).toBe(true);
  });

  it("any other failure rolls back and alerts", async () => {
    const list = { items: [item(1, "waiting")] };
    const game = detail(1, { status: "waiting", rating: null });
    queryClient.setQueryData(keys.backlog.list(), list);
    queryClient.setQueryData(keys.games.detail(1), game);
    const error = new ApiError({ status: 500, type: "about:blank", title: "Server Error" });
    api.upsertBacklogEntry.mockRejectedValue(error);

    await writes.move(1, "playing");

    expect(getList()).toEqual(list);
    expect(getDetail(1)).toEqual(game);
    expect(effects.alertError).toHaveBeenCalledTimes(1);
    expect(effects.alertError).toHaveBeenCalledWith(error);
    expect(effects.openPaywall).not.toHaveBeenCalled();
  });

  it("the haptic plays at apply time on a status change, not on a re-rate", async () => {
    queryClient.setQueryData(keys.games.detail(1), detail(1, { status: "waiting", rating: null }));
    const pending = deferred();
    api.upsertBacklogEntry.mockReturnValue(pending.promise);

    const moved = writes.move(1, "playing");

    await vi.waitFor(() => expect(api.upsertBacklogEntry).toHaveBeenCalled());
    expect(effects.playStatusHaptic).toHaveBeenCalledTimes(1);
    pending.resolve();
    await moved;

    api.upsertBacklogEntry.mockResolvedValue({});
    await writes.rate(1, "playing", 9);

    expect(api.upsertBacklogEntry).toHaveBeenCalledTimes(2);
    expect(effects.playStatusHaptic).toHaveBeenCalledTimes(1);
  });

  it("remove drops the row and plays no haptic", async () => {
    queryClient.setQueryData(keys.backlog.list(), {
      items: [item(1, "waiting"), item(2, "playing")],
    });
    queryClient.setQueryData(keys.games.detail(1), detail(1, { status: "waiting", rating: null }));
    const pending = deferred();
    api.deleteBacklogEntry.mockReturnValue(pending.promise);

    const done = writes.remove(1);

    await vi.waitFor(() => expect(api.deleteBacklogEntry).toHaveBeenCalledWith(1));
    expect(getList()?.items.map((i) => i.gameId)).toEqual([2]);
    expect(getDetail(1)?.backlogEntry).toBeNull();
    expect(effects.playStatusHaptic).not.toHaveBeenCalled();

    pending.resolve();
    await done;
  });

  it("a move from Home with only the list cached keeps the list item's rating", async () => {
    queryClient.setQueryData(keys.backlog.list(), { items: [item(1, "completed", 8)] });
    const pending = deferred();
    api.upsertBacklogEntry.mockReturnValue(pending.promise);

    const done = writes.move(1, "abandoned");

    await vi.waitFor(() => expect(api.upsertBacklogEntry).toHaveBeenCalled());
    expect(api.upsertBacklogEntry).toHaveBeenCalledWith(1, { status: "abandoned" });
    expect(getList()?.items.find((i) => i.gameId === 1)).toMatchObject({
      status: "abandoned",
      rating: 8,
    });

    pending.resolve();
    await done;
  });

  it("a settled write leaves no mutation in the cache once it is collectable", async () => {
    vi.useFakeTimers();
    // Node reads as a server to query-core, whose default gcTime is Infinity;
    // the device's is five minutes.
    queryClient.setDefaultOptions({ mutations: { retry: false, gcTime: 5 * 60_000 } });
    queryClient.setQueryData(keys.backlog.list(), { items: [item(1, "waiting")] });

    await writes.move(1, "playing");
    api.upsertBacklogEntry.mockRejectedValue(
      new ApiError({ status: 500, type: "about:blank", title: "Server Error" }),
    );
    await writes.rate(1, "playing", 5);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(queryClient.getMutationCache().getAll()).toEqual([]);
  });
});
