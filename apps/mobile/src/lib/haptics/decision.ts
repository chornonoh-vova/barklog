import type { BacklogStatus } from "@repo/contracts";

/** The system notification patterns the app plays, each only for its
 * documented meaning (HIG, *Playing haptics*). */
export type HapticFeedback = "success" | "error";

/** Every app-owned event the haptic rule has an answer for. Pickers, menus,
 * pull to refresh and RevenueCat's paywall play their own feedback and are not
 * events here: the app adds nothing to them. */
export type HapticEvent =
  /** The server confirmed an add, a move or a re-rate. `from` is the status
   * before the write: `null` when the game was not in the backlog, `undefined`
   * when no cache knew it. */
  | { kind: "entryWritten"; from: BacklogStatus | null | undefined; to: BacklogStatus }
  | { kind: "entryRemoved" }
  | { kind: "releaseAlert"; on: boolean }
  /** A write failed and an error alert is shown with it. */
  | { kind: "writeFailed" }
  /** A 402 (or the slot check) opened the paywall. */
  | { kind: "paywallOpened" };

/**
 * The app-wide haptic rule: success for a deliberate decision, error with a
 * write-failure alert, and nothing for edits that are easily undone or whose
 * feedback is already on screen. Recorded in the mobile architecture reference.
 */
export function decisionHaptic(event: HapticEvent): HapticFeedback | null {
  switch (event.kind) {
    // A status change is the decision the app exists to record; a rating-only
    // edit arrives with the status unchanged and stays quiet. An unknown
    // previous status still plays, because a status was picked on purpose.
    case "entryWritten":
      return event.from === event.to ? null : "success";

    // Turning an alert on is a decision; turning it off is undoable, like a
    // rating edit.
    case "releaseAlert":
      return event.on ? "success" : null;

    case "writeFailed":
      return "error";

    // The confirmation dialog and the paywall sheet are the feedback.
    case "entryRemoved":
    case "paywallOpened":
      return null;
  }
}
