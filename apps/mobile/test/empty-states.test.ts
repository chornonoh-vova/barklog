import { BACKLOG_STATUSES } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { EMPTY_BACKLOG, EMPTY_FILTER } from "@/features/backlog/empty-states";

describe("EMPTY_BACKLOG", () => {
  it("is the onboarding state", () => {
    expect(EMPTY_BACKLOG.title).toBe("Your backlog is empty");
    expect(EMPTY_BACKLOG.systemImage).toBe("gamecontroller");
    expect(EMPTY_BACKLOG.description).toMatch(/what you're playing/);
  });
});

describe("EMPTY_FILTER", () => {
  it("has copy for every status in the enum", () => {
    for (const status of BACKLOG_STATUSES) {
      const state = EMPTY_FILTER[status];

      expect(state, `missing empty state for "${status}"`).toBeDefined();
      expect(state.title).not.toBe("");
      expect(state.systemImage).not.toBe("");
      expect(state.description).not.toBe("");
    }
  });

  it("has no extra keys beyond the enum", () => {
    expect(Object.keys(EMPTY_FILTER).sort()).toEqual([...BACKLOG_STATUSES].sort());
  });

  it("uses the per-status symbol from the design", () => {
    expect(EMPTY_FILTER.waiting.systemImage).toBe("clock");
    expect(EMPTY_FILTER.playing.systemImage).toBe("gamecontroller");
    expect(EMPTY_FILTER.completed.systemImage).toBe("checkmark.seal");
    expect(EMPTY_FILTER.abandoned.systemImage).toBe("xmark.bin");
  });

  it("gives each status distinct copy", () => {
    const titles = BACKLOG_STATUSES.map((s) => EMPTY_FILTER[s].title);

    expect(new Set(titles).size).toBe(titles.length);
  });
});
