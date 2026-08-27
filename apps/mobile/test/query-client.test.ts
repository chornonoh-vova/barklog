import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/errors";
import { createQueryClient } from "@/query-client";

function retry() {
  const fn = createQueryClient().getDefaultOptions().queries?.retry;
  if (typeof fn !== "function") throw new Error("retry must be a function");
  return fn as (failureCount: number, error: unknown) => boolean;
}

describe("createQueryClient — retry", () => {
  it("never retries a 404", () => {
    const error = new ApiError({ status: 404, type: "about:blank", title: "Not Found" });
    expect(retry()(0, error)).toBe(false);
  });

  it("never retries a 429", () => {
    const error = new ApiError({ status: 429, type: "about:blank", title: "Too Many Requests" });
    expect(retry()(0, error)).toBe(false);
  });

  it("retries a 500 while failureCount < 2, then stops", () => {
    const error = new ApiError({
      status: 500,
      type: "about:blank",
      title: "Internal Server Error",
    });
    const fn = retry();
    expect(fn(0, error)).toBe(true);
    expect(fn(1, error)).toBe(true);
    expect(fn(2, error)).toBe(false);
  });

  it("applies the same count-based behaviour to a non-ApiError", () => {
    const error = new Error("boom");
    const fn = retry();
    expect(fn(0, error)).toBe(true);
    expect(fn(1, error)).toBe(true);
    expect(fn(2, error)).toBe(false);
  });
});
