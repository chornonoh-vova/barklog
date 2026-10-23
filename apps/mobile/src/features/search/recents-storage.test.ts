import { beforeEach, describe, expect, it, vi } from "vitest";

// Factory form, as in storage-flag.test.ts: the real module pulls in
// react-native, which the Vitest config runs with no transform for.
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));

// Fresh module state per test: the store keeps its list at module level.
async function load() {
  vi.resetModules();
  const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
  vi.mocked(AsyncStorage.setItem).mockResolvedValue();
  vi.mocked(AsyncStorage.removeItem).mockResolvedValue();
  const store = await import("@/features/search/recents-storage");
  return { AsyncStorage, ...store };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recents store", () => {
  it("a search made before the stored list loads adds to it", async () => {
    const { AsyncStorage, recordRecent, recentsStore } = await load();
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('["zelda"]');

    await recordRecent("mario");

    expect(recentsStore.getSnapshot()).toEqual(["mario", "zelda"]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("search.recents", '["mario","zelda"]');
  });

  it("clearing notifies subscribers synchronously", async () => {
    const { AsyncStorage, clearRecents, recentsStore } = await load();
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('["zelda"]');
    const listener = vi.fn();
    recentsStore.subscribe(listener);

    clearRecents();

    expect(listener).toHaveBeenCalled();
    expect(recentsStore.getSnapshot()).toEqual([]);
  });

  it("a load in flight when cleared does not bring the list back", async () => {
    const { AsyncStorage, clearRecents, recentsStore } = await load();
    let resolveRead!: (raw: string) => void;
    vi.mocked(AsyncStorage.getItem).mockReturnValue(
      new Promise<string>((resolve) => (resolveRead = resolve)),
    );
    const loading = recentsStore.load();
    await vi.waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

    clearRecents();
    resolveRead('["zelda"]');
    await loading;

    expect(recentsStore.getSnapshot()).toEqual([]);
  });

  it("a failed read starts empty", async () => {
    const { AsyncStorage, recentsStore } = await load();
    vi.mocked(AsyncStorage.getItem).mockRejectedValue(new Error("boom"));

    await recentsStore.load();

    expect(recentsStore.getSnapshot()).toEqual([]);
  });
});
