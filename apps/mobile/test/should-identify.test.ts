import { expect, test } from "vitest";

import { identifyAction } from "@/purchases/should-identify";

test("nothing happens before Clerk has resolved", () => {
  expect(identifyAction(undefined, undefined)).toBe("none");
});

test("a resolved user is identified", () => {
  expect(identifyAction(undefined, "user_a")).toBe("login");
});

test("the same user is not re-identified on every render", () => {
  expect(identifyAction("user_a", "user_a")).toBe("none");
});

test("a switched user is re-identified, so premium never carries across accounts", () => {
  expect(identifyAction("user_a", "user_b")).toBe("login");
});

test("a sign-out logs out", () => {
  expect(identifyAction("user_a", null)).toBe("logout");
});

test("an undefined current user is Clerk mid-establishment, so nothing happens", () => {
  expect(identifyAction("user_a", undefined)).toBe("none");
});

test("a repeated signed-out state does nothing", () => {
  expect(identifyAction(null, null)).toBe("none");
});
