import { decisionHaptic, type HapticEvent, type HapticFeedback } from "@/lib/haptics/decision";

describe("decisionHaptic", () => {
  const cases: [string, HapticEvent, HapticFeedback | null][] = [
    ["a game added to the backlog", { kind: "entryWritten", from: null, to: "waiting" }, "success"],
    [
      "a game moved to another status",
      { kind: "entryWritten", from: "playing", to: "completed" },
      "success",
    ],
    [
      "a status picked while the previous one is unknown",
      { kind: "entryWritten", from: undefined, to: "abandoned" },
      "success",
    ],
    [
      "a rating-only change (status unchanged)",
      { kind: "entryWritten", from: "playing", to: "playing" },
      null,
    ],
    ["a release alert turned on", { kind: "releaseAlert", on: true }, "success"],
    ["a release alert turned off", { kind: "releaseAlert", on: false }, null],
    ["a failed write, shown with an alert", { kind: "writeFailed" }, "error"],
    ["a game removed from the backlog", { kind: "entryRemoved" }, null],
    ["a 402 opening the paywall", { kind: "paywallOpened" }, null],
  ];

  it.each(cases)("%s → %p", (_, event, expected) => {
    expect(decisionHaptic(event)).toBe(expected);
  });
});
