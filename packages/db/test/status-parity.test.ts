import {
  BACKLOG_SORTS as CONTRACT_SORTS,
  BACKLOG_STATUSES as CONTRACT_STATUSES,
  PERIOD_TYPES as CONTRACT_PERIODS,
  SUBSCRIPTION_STORES as CONTRACT_STORES,
} from "@repo/contracts";
import { expect, test } from "vitest";

import { BACKLOG_SORTS } from "../src/queries/backlog.js";
import { BACKLOG_STATUSES } from "../src/schema/backlog.js";
import { PERIOD_TYPES, SUBSCRIPTION_STORES } from "../src/schema/subscriptions.js";

test("the contract status union matches the database enum, in order", () => {
  expect([...BACKLOG_STATUSES]).toEqual([...CONTRACT_STATUSES]);
});

test("the contract sort union matches the query module's, in order", () => {
  expect([...BACKLOG_SORTS]).toEqual([...CONTRACT_SORTS]);
});

test("the contract store union matches the database enum, in order", () => {
  expect([...SUBSCRIPTION_STORES]).toEqual([...CONTRACT_STORES]);
});

test("the contract period-type union matches the database enum, in order", () => {
  expect([...PERIOD_TYPES]).toEqual([...CONTRACT_PERIODS]);
});
