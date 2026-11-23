import type { BacklogStatus } from "@repo/contracts";

/** Each pattern is played only for its documented meaning (HIG, *Playing haptics*). */
export type HapticFeedback = "success" | "error";

/** Pickers, menus, pull to refresh and RevenueCat's paywall play their own feedback. */
export type HapticEvent =
  /** `from`: `null` when the game was not in the backlog, `undefined` when no cache knew it. */
  | { kind: "entryWritten"; from: BacklogStatus | null | undefined; to: BacklogStatus }
  | { kind: "entryRemoved" }
  | { kind: "releaseAlert"; on: boolean }
  | { kind: "writeFailed" }
  | { kind: "paywallOpened" };

/** Success for a deliberate decision, error with a failure alert, nothing for undoable edits. */
export function decisionHaptic(event: HapticEvent): HapticFeedback | null {
  switch (event.kind) {
    // Rating-only edits keep the status and stay quiet; an unknown `from` still plays.
    case "entryWritten":
      return event.from === event.to ? null : "success";

    // Turning an alert off is undoable, like a rating edit.
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
