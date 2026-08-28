import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * AsyncStorage, not `expo-secure-store`: this is not a secret, and SecureStore's
 * keychain entries outlive an uninstall. The flag living in the app container is
 * the point — a reinstall shows onboarding again, which is exactly what the Skip
 * button is for.
 */
const KEY = "barklog.onboarding.seen";

/**
 * A failed read resolves to `true`, which is the opposite of the obvious
 * default. This is not resolving an ambiguity: a missing key (`null`) and a
 * broken read (throws) are perfectly distinguishable here, so `false` for a
 * throw was always available too. The actual trade is "never see onboarding
 * when storage is broken" against "see a dismissable onboarding on every
 * launch" — and `onboarding-gate.tsx` completes locally as soon as Skip or
 * Start is pressed, regardless of whether this read or the write in
 * `markOnboardingSeen` ever works, so nobody is trapped either way. Repeated
 * onboarding reading as a bug, rather than as a rare and recoverable
 * annoyance, is why `true` won.
 */
export async function readHasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) !== null;
  } catch {
    return true;
  }
}

/**
 * Swallows failures. Seeing onboarding once more next launch is an annoyance; an
 * unhandled rejection between the last page and the auth gate is not.
 */
export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "1");
  } catch {
    // Intentionally ignored, per the doc comment.
  }
}
