import { BACKLOG_STATUSES as CONTRACT_STATUSES } from "@repo/contracts";
import { expect, test } from "vitest";

import { BACKLOG_STATUSES } from "../src/schema/backlog.js";

/**
 * Two declarations of the same union: the Postgres enum and the valibot picklist the
 * mobile app pickers read. A mismatch would be a 422 for a status the database
 * accepts, or an insert that fails a constraint the client never checked.
 */
test("the contract status union matches the database enum, in order", () => {
  expect([...BACKLOG_STATUSES]).toEqual([...CONTRACT_STATUSES]);
});
