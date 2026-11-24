import { router } from "expo-router";

/** The one path into the paywall, so a change to how it opens lands everywhere. */
export function openPaywall(): void {
  router.push("/paywall");
}
