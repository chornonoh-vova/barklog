import AsyncStorage from "@react-native-async-storage/async-storage";

import { parseRecents } from "@/features/search/recents";

const KEY = "search.recents";

/** AsyncStorage like `storage/flag.ts`: an uninstall clears it. Failures are
 * swallowed — losing a recent search is not worth an error. */
export async function readRecents(): Promise<string[]> {
  try {
    return parseRecents(await AsyncStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export async function writeRecents(list: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Ignored: see above.
  }
}

export async function clearRecents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Ignored: see above.
  }
}
