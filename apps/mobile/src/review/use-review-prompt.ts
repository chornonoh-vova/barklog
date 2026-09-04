import * as StoreReview from "expo-store-review";
import { useEffect, useRef } from "react";

import { hasSeenPaywallThisSession } from "./session";
import { shouldRequestReview } from "./should-request-review";
import { markAskedForReview, readHasAskedForReview } from "./storage";

/**
 * Fires at most once per install, from a screen the user arrived at under their
 * own steam — never from a button, which Apple's guidelines forbid.
 *
 * The flag is written *before* the prompt, not after: `requestReview` resolves
 * whether or not iOS actually drew anything, so there is no success to wait
 * for, and a crash between the two would otherwise re-ask on the next launch.
 */
export function useReviewPrompt(completed: number | undefined): void {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || completed === undefined) return;

    let active = true;

    void (async () => {
      const asked = await readHasAskedForReview();
      if (!active) return;

      const sawPaywall = hasSeenPaywallThisSession();
      if (!shouldRequestReview({ completed, asked, sawPaywall })) return;

      // `hasAction` covers both a device that cannot show the sheet and a build
      // whose store configuration would make the call a no-op.
      if (!(await StoreReview.hasAction()) || !active) return;

      fired.current = true;
      await markAskedForReview();
      await StoreReview.requestReview();
    })();

    return () => {
      active = false;
    };
  }, [completed]);
}
