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
 * default. If storage is broken then the write in `markOnboardingSeen` fails
 * too, so a `false` here would show onboarding on every launch with no way to
 * get past it. Missing an optional flow beats being trapped in one.
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
