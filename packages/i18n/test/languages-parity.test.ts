import { PUSH_LOCALES } from "@repo/contracts";
import { expect, test } from "vitest";

import { LANGUAGES } from "../src/index.js";

test("push device locales are exactly the app's languages, in order", () => {
  expect([...PUSH_LOCALES]).toEqual([...LANGUAGES]);
});
