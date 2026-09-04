import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** `expo-image`'s cross-fade, in ms, when motion is not being reduced. */
const IMAGE_TRANSITION_MS = 150;

/**
 * Subscribed, not read once: Reduce Motion can be switched on while the app is
 * running, which is exactly what someone testing accessibility does. Starts
 * `false` so the first paint matches the common case — the real value lands a
 * tick later, well before any image has finished decoding.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/** Cross-fade duration for `expo-image`, or none at all under Reduce Motion. */
export function useImageTransition(): number {
  return useReducedMotion() ? 0 : IMAGE_TRANSITION_MS;
}
