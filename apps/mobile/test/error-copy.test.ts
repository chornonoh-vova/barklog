import { describe, expect, it } from "vitest";

import { errorCopy } from "@/api/error-copy";
import { ApiError } from "@/api/errors";

describe("errorCopy", () => {
  it("returns offline copy for status 0", () => {
    const copy = errorCopy(
      new ApiError({
        status: 0,
        type: "about:blank",
        title: "Network unavailable",
        detail: "Barklog could not reach the server. Check your connection.",
      }),
    );

    expect(copy.title).toBe("You're offline");
    expect(copy.description).toBe("Barklog could not reach the server. Check your connection.");
  });

  it("returns rate-limit copy for a 429", () => {
    const copy = errorCopy(
      new ApiError({ status: 429, type: "about:blank", title: "Too Many Requests" }),
    );

    expect(copy.title).toBe("Slow down a moment");
    expect(copy.description).toBe("You've made a lot of requests. Try again shortly.");
  });

  it("returns generic copy for a 5xx and does not use detail", () => {
    // The API strips `detail` from 5xx problem documents by design, but even
    // if one somehow carried a detail, the generic copy must not surface it.
    const copy = errorCopy(
      new ApiError({
        status: 500,
        type: "about:blank",
        title: "Internal Server Error",
        detail: "a stack trace or schema name that should never reach the UI",
      }),
    );

    expect(copy.title).toBe("Barklog is having trouble");
    expect(copy.description).toBe("The server couldn't answer. Try again in a moment.");
  });

  it("passes through title and detail for a 4xx", () => {
    const copy = errorCopy(
      new ApiError({
        status: 404,
        type: "about:blank",
        title: "Not Found",
        detail: "Game 999 is not in the mirror.",
      }),
    );

    expect(copy.title).toBe("Not Found");
    expect(copy.description).toBe("Game 999 is not in the mirror.");
  });

  it("falls back to generic copy for a non-ApiError value", () => {
    expect(errorCopy(new Error("boom"))).toEqual({
      title: "Something went wrong",
      description: "Please try again.",
    });
    expect(errorCopy("boom")).toEqual({
      title: "Something went wrong",
      description: "Please try again.",
    });
  });
});
