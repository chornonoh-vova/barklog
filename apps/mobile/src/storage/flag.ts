import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Flag {
  read: () => Promise<boolean>;
  mark: () => Promise<void>;
}

/**
 * A one-way boolean. AsyncStorage rather than `expo-secure-store`, so an
 * uninstall clears it — a reinstall is a fresh relationship with the app.
 *
 * A failed read resolves to `true`, which is the safe direction for both
 * current flags: showing onboarding again reads as a bug, and iOS grants only
 * three review prompts a year and drops the rest silently. Neither is worth
 * spending on a storage error.
 */
export function persistentFlag(key: string): Flag {
  return {
    async read() {
      try {
        return (await AsyncStorage.getItem(key)) !== null;
      } catch {
        return true;
      }
    },
    // Never rejects: callers chain state off this and must not be derailed.
    async mark() {
      try {
        await AsyncStorage.setItem(key, "1");
      } catch {
        // Ignored: see above.
      }
    },
  };
}
