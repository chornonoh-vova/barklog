import { BACKLOG_STATUSES } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { emptyBacklog, emptyFilter } from "@/features/backlog/empty-states";

describe("emptyBacklog", () => {
  it("is the onboarding state", () => {
    expect(emptyBacklog().title).toBe("Your backlog is empty");
    expect(emptyBacklog().systemImage).toBe("gamecontroller");
    expect(emptyBacklog().description).toMatch(/what you're playing/);
  });
});

describe("emptyFilter", () => {
  it("has copy for every status in the enum", () => {
    for (const status of BACKLOG_STATUSES) {
      const state = emptyFilter(status);

      expect(state, `missing empty state for "${status}"`).toBeDefined();
      expect(state.title).not.toBe("");
      expect(state.systemImage).not.toBe("");
      expect(state.description).not.toBe("");
    }
  });

  it("uses the per-status symbol from the design", () => {
    expect(emptyFilter("waiting").systemImage).toBe("clock");
    expect(emptyFilter("playing").systemImage).toBe("gamecontroller");
    expect(emptyFilter("completed").systemImage).toBe("checkmark.seal");
    expect(emptyFilter("abandoned").systemImage).toBe("xmark.bin");
  });

  it("gives each status distinct copy", () => {
    const titles = BACKLOG_STATUSES.map((s) => emptyFilter(s).title);

    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("backlog illustrations", () => {
  it("gives the empty backlog the backlog mascot", () => {
    expect(emptyBacklog().illustration).toBe("backlog");
  });

  it("gives every status filter the backlog mascot", () => {
    for (const status of BACKLOG_STATUSES) {
      expect(emptyFilter(status).illustration, status).toBe("backlog");
    }
  });

  it("keeps a symbol on every state, so a missing mascot still renders something", () => {
    for (const state of [emptyBacklog(), ...BACKLOG_STATUSES.map((s) => emptyFilter(s))]) {
      expect(state.systemImage).not.toBe("");
    }
  });
});
