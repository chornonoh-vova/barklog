import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * AsyncStorage, not `expo-secure-store`: the flag must not survive an uninstall,
 * since a reinstall showing onboarding again is what Skip is for.
 */
const KEY = "barklog.onboarding.seen";

/**
 * A failed read resolves to `true` (seen), the opposite of the obvious default.
 * A missing key and a broken read are distinguishable here, so this is a choice
 * rather than an ambiguity: onboarding returning on every launch reads as a bug,
 * while skipping it once does not. Nobody is trapped either way, because
 * `onboarding-gate.tsx` completes locally on Skip or Start whether or not
 * storage works.
 */
export async function readHasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) !== null;
  } catch {
    return true;
  }
}

/** Swallows failures: a rejection here would block entry to the app. */
export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "1");
  } catch {
    // Ignored, per the doc comment.
  }
}
