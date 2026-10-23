import AsyncStorage from "@react-native-async-storage/async-storage";

import { keys } from "@/lib/api/keys";
import { clearPersistedCaches, startPersistence } from "@/lib/query/query-persist";
import { PERSIST_MAX_AGE, persistKey } from "@/lib/query/query-persist-policy";
import { backlogItem, backlogList, gameDetail } from "@test/fixtures";
import { testQueryClient } from "@test/render";

/** Past the persister's one-second save throttle. */
const flushSaves = () => jest.advanceTimersByTimeAsync(1_500);

const saved = async (userId: string) => {
  const raw = await AsyncStorage.getItem(persistKey(userId));
  return raw === null ? null : (JSON.parse(raw) as { clientState: { queries: unknown[] } });
};

describe("startPersistence", () => {
  const stops: (() => void)[] = [];

  beforeEach(async () => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    jest.useRealTimers();
  });

  function start(queryClient = testQueryClient(), userId = "user_1") {
    stops.push(startPersistence(queryClient, userId));
    return queryClient;
  }

  it("saves the backlog list under the user's own key, and nothing else", async () => {
    const queryClient = start();
    await flushSaves();

    queryClient.setQueryData(keys.backlog.list(), backlogList(backlogItem(1)));
    queryClient.setQueryData(keys.games.detail(1), gameDetail());
    await flushSaves();

    const state = await saved("user_1");
    expect(state?.clientState.queries).toEqual([
      expect.objectContaining({
        queryKey: keys.backlog.list(),
        state: expect.objectContaining({ data: backlogList(backlogItem(1)) }),
      }),
    ]);
    expect(await saved("user_2")).toBeNull();
  });

  it("keeps a restored list from being garbage-collected before Home mounts it", () => {
    const queryClient = start();

    expect(queryClient.getQueryDefaults(keys.backlog.list()).gcTime).toBe(PERSIST_MAX_AGE);
  });

  it("restores the saved list on the next launch, marked for a refetch", async () => {
    const first = start();
    await flushSaves();
    first.setQueryData(keys.backlog.list(), backlogList(backlogItem(4)));
    await flushSaves();
    stops.splice(0).forEach((stop) => stop());

    const next = start(testQueryClient());
    await flushSaves();

    expect(next.getQueryData(keys.backlog.list())).toEqual(backlogList(backlogItem(4)));
    expect(next.getQueryState(keys.backlog.list())?.isInvalidated).toBe(true);
  });

  it("does not restore another user's cache", async () => {
    const first = start(testQueryClient(), "user_1");
    await flushSaves();
    first.setQueryData(keys.backlog.list(), backlogList(backlogItem(4)));
    await flushSaves();

    const other = start(testQueryClient(), "user_2");
    await flushSaves();

    expect(other.getQueryData(keys.backlog.list())).toBeUndefined();
  });

  it("writes nothing once stopped", async () => {
    const queryClient = testQueryClient();
    const stop = startPersistence(queryClient, "user_1");
    await flushSaves();
    stop();

    queryClient.setQueryData(keys.backlog.list(), backlogList(backlogItem(1)));
    await flushSaves();

    expect((await saved("user_1"))?.clientState.queries ?? []).toEqual([]);
  });

  it("discards a cache saved by a different build", async () => {
    await AsyncStorage.setItem(
      persistKey("user_1"),
      JSON.stringify({
        buster: "0.0.1:old-update",
        timestamp: Date.now(),
        clientState: { mutations: [], queries: [] },
      }),
    );

    const queryClient = start();
    await flushSaves();

    expect(queryClient.getQueryData(keys.backlog.list())).toBeUndefined();
    expect(await AsyncStorage.getItem(persistKey("user_1"))).toBeNull();
  });

  it("drops a corrupt cache and carries on", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    await AsyncStorage.setItem(persistKey("user_1"), "{not json");

    const queryClient = start();
    await flushSaves();

    expect(queryClient.getQueryData(keys.backlog.list())).toBeUndefined();
    expect(await AsyncStorage.getItem(persistKey("user_1"))).toBeNull();
    jest.mocked(console.error).mockRestore();
  });
});

describe("clearPersistedCaches", () => {
  beforeEach(async () => {
    await AsyncStorage.multiSet([
      [persistKey("user_1"), "{}"],
      [persistKey("user_2"), "{}"],
      ["search.recents", "[]"],
    ]);
  });

  it("removes every other user's cache, keeping the current one", async () => {
    await clearPersistedCaches("user_1");

    expect(await AsyncStorage.getAllKeys()).toEqual(
      expect.arrayContaining([persistKey("user_1"), "search.recents"]),
    );
    expect(await AsyncStorage.getItem(persistKey("user_2"))).toBeNull();
  });

  it("removes every cache when nobody is signed in", async () => {
    await clearPersistedCaches(null);

    expect(await AsyncStorage.getAllKeys()).toEqual(["search.recents"]);
  });

  it("never rejects when storage fails", async () => {
    jest.mocked(AsyncStorage.getAllKeys).mockRejectedValueOnce(new Error("disk"));

    await expect(clearPersistedCaches(null)).resolves.toBeUndefined();
  });
});
