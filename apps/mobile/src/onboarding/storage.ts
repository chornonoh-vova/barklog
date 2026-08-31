import AsyncStorage from "@react-native-async-storage/async-storage";

/** AsyncStorage, not `expo-secure-store`: the flag must not survive an uninstall. */
const KEY = "barklog.onboarding.seen";

/** A failed read resolves to `true` (seen), deliberately: onboarding returning
 * on every launch reads as a bug, while skipping it once does not. */
export async function readHasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) !== null;
  } catch {
    return true;
  }
}

/** Never rejects: `onboarding-gate.tsx` chains local state off this call. */
export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "1");
  } catch {
    // Ignored: see above.
  }
}
