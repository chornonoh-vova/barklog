import { getLogger, withContext } from "@logtape/logtape";
import { afterEach, beforeEach, expect, test } from "vitest";

import { configureLogging, resetLogging } from "../src/index.js";
import { recordingSink, type RecordingSink } from "../src/testing.js";

let logs: RecordingSink;

beforeEach(async () => {
  logs = recordingSink();
  await configureLogging({ service: "test", level: "debug", sink: logs.sink });
});

afterEach(async () => {
  await resetLogging();
});

test("records carry their category, level and properties", () => {
  getLogger(["test", "unit"]).info("Seeded {count} games.", { count: 10 });

  const record = logs.records[0];
  expect(record?.category).toEqual(["test", "unit"]);
  expect(record?.level).toBe("info");
  expect(record?.properties).toMatchObject({ count: 10 });
});

test("a level below the threshold is dropped", async () => {
  await configureLogging({ service: "test", level: "warning", sink: logs.sink });

  getLogger(["test"]).info("Ignored.");
  getLogger(["test"]).error("Kept.");

  expect(logs.records.map((record) => record.level)).toEqual(["error"]);
});

test("an implicit context reaches every record inside it", () => {
  withContext({ runId: "run-1" }, () => {
    getLogger(["test"]).info("Started.");
    getLogger(["test", "deep"]).warn("Something odd.");
  });
  getLogger(["test"]).info("Outside.");

  expect(logs.records.map((record) => record.properties.runId)).toEqual([
    "run-1",
    "run-1",
    undefined,
  ]);
});

test("records outside the configured service are not sunk", () => {
  getLogger(["somebody-else"]).error("Not ours.");

  expect(logs.records).toEqual([]);
});
