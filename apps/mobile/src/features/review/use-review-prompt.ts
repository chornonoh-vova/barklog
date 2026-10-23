import * as StoreReview from "expo-store-review";
import { useEffect, useRef } from "react";

import { useBacklog } from "@/lib/api/hooks";
import { countStatus } from "@/features/backlog/slots";

import { hasSeenPaywallThisSession } from "./session";
import { shouldRequestReview } from "./should-request-review";
import { markAskedForReview, readHasAskedForReview } from "./storage";

/**
 * Fires at most once per install, from a screen the user reached under their
 * own steam — never from a button, which Apple's guidelines forbid.
 *
 * The flag is written *before* the prompt: `requestReview` resolves whether or
 * not iOS drew anything, so there is no success to wait for, and a crash
 * between the two would otherwise re-ask on the next launch.
 */
export function useReviewPrompt(): void {
  const { data } = useBacklog();
  const completed = data === undefined ? undefined : countStatus(data.items, "completed");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;

    let active = true;

    void (async () => {
      const asked = await readHasAskedForReview();

      // Latch on `asked` as well as on prompting: every backlog write
      // invalidates the list, and re-reading a flag that cannot change back
      // would go on for the life of the install.
      if (asked) done.current = true;

      const sawPaywall = hasSeenPaywallThisSession();
      if (!shouldRequestReview({ completed, asked, sawPaywall })) return;

      // `hasAction` covers a device that cannot show the sheet and a build
      // whose store configuration would make the call a no-op.
      if (!active || !(await StoreReview.hasAction())) return;

      done.current = true;
      await markAskedForReview();
      await StoreReview.requestReview();
    })();

    return () => {
      active = false;
    };
  }, [completed]);
}
