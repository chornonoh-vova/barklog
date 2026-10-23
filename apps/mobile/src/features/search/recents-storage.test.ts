import type AsyncStorageModule from "@react-native-async-storage/async-storage";
import { waitFor } from "@testing-library/react-native";

import type * as RecentsStorage from "@/features/search/recents-storage";

// Fresh module state per test: the store keeps its list at module level.
function load() {
  jest.resetModules();
  const { default: AsyncStorage } = jest.requireMock<{ default: typeof AsyncStorageModule }>(
    "@react-native-async-storage/async-storage",
  );
  jest.mocked(AsyncStorage.setItem).mockResolvedValue();
  jest.mocked(AsyncStorage.removeItem).mockResolvedValue();
  const store = jest.requireActual<typeof RecentsStorage>("@/features/search/recents-storage");
  return { AsyncStorage, ...store };
}

describe("recents store", () => {
  it("a search made before the stored list loads adds to it", async () => {
    const { AsyncStorage, recordRecent, recentsStore } = load();
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('["zelda"]');

    await recordRecent("mario");

    expect(recentsStore.getSnapshot()).toEqual(["mario", "zelda"]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("search.recents", '["mario","zelda"]');
  });

  it("clearing notifies subscribers synchronously", async () => {
    const { AsyncStorage, clearRecents, recentsStore } = load();
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('["zelda"]');
    const listener = jest.fn();
    recentsStore.subscribe(listener);

    clearRecents();

    expect(listener).toHaveBeenCalled();
    expect(recentsStore.getSnapshot()).toEqual([]);
  });

  it("a load in flight when cleared does not bring the list back", async () => {
    const { AsyncStorage, clearRecents, recentsStore } = load();
    let resolveRead!: (raw: string) => void;
    jest
      .mocked(AsyncStorage.getItem)
      .mockReturnValue(new Promise<string>((resolve) => (resolveRead = resolve)));
    const loading = recentsStore.load();
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());

    clearRecents();
    resolveRead('["zelda"]');
    await loading;

    expect(recentsStore.getSnapshot()).toEqual([]);
  });

  it("a failed read starts empty", async () => {
    const { AsyncStorage, recentsStore } = load();
    jest.mocked(AsyncStorage.getItem).mockRejectedValue(new Error("boom"));

    await recentsStore.load();

    expect(recentsStore.getSnapshot()).toEqual([]);
  });
});
