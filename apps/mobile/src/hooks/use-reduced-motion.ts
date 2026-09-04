import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

const IMAGE_TRANSITION_MS = 150;

/**
 * One subscription for the whole app, not one per hook call: `RemoteImage` is a
 * list-cell leaf, so per-instance state would mean a native round-trip and a
 * listener registration for every row scrolled past.
 *
 * Subscribed rather than read once because Reduce Motion can be switched on
 * while the app is running, which is exactly what someone testing accessibility
 * does.
 */
let reduced = false;
const listeners = new Set<() => void>();

function emit(value: boolean): void {
  if (value === reduced) return;

  reduced = value;
  for (const listener of listeners) listener();
}

void AccessibilityInfo.isReduceMotionEnabled().then(emit);
AccessibilityInfo.addEventListener("reduceMotionChanged", emit);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): boolean {
  return reduced;
}

export function useImageTransition(): number {
  return useSyncExternalStore(subscribe, snapshot) ? 0 : IMAGE_TRANSITION_MS;
}
