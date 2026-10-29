import { router } from "expo-router";

/** Every way into the paywall: the toolbar star, Home's spots hint and a move
 * past the free tier. One path, so a change to how it opens lands everywhere. */
export function openPaywall(): void {
  router.push("/paywall");
}
