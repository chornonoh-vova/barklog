import {
  BACKLOG_SORTS as CONTRACT_SORTS,
  BACKLOG_STATUSES as CONTRACT_STATUSES,
} from "@repo/contracts";
import { expect, test } from "vitest";

import { BACKLOG_SORTS } from "../src/queries/backlog.js";
import { BACKLOG_STATUSES } from "../src/schema/backlog.js";

/**
 * Two declarations of the same union: the Postgres enum and the valibot picklist the
 * mobile app pickers read. A mismatch would be a 422 for a status the database
 * accepts, or an insert that fails a constraint the client never checked.
 */
test("the contract status union matches the database enum, in order", () => {
  expect([...BACKLOG_STATUSES]).toEqual([...CONTRACT_STATUSES]);
});

test("the contract sort union matches the query module's, in order", () => {
  expect([...BACKLOG_SORTS]).toEqual([...CONTRACT_SORTS]);
});
