import { BACKLOG_STATUSES } from "@repo/contracts";
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("resolves @repo/contracts from the mobile package", () => {
    expect(BACKLOG_STATUSES).toEqual(["waiting", "playing", "completed", "abandoned"]);
  });
});
