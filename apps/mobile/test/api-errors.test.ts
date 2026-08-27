import { describe, expect, it } from "vitest";

import { ApiError, isApiError, toApiError } from "@/api/errors";

const response = (status: number, statusText = ""): Response =>
  new Response(null, { status, statusText });

describe("toApiError", () => {
  it("reads every member of a problem document", () => {
    const error = toApiError(response(404), {
      type: "https://barklog.gg/problems/not-found",
      title: "Not Found",
      status: 404,
      detail: "Game 999 is not in the mirror.",
      instance: "/api/games/999",
      traceId: "01JQ8F3K2M9X7YB4NDVWZP6HRC",
    });

    expect(error.status).toBe(404);
    expect(error.type).toBe("https://barklog.gg/problems/not-found");
    expect(error.title).toBe("Not Found");
    expect(error.detail).toBe("Game 999 is not in the mirror.");
    expect(error.traceId).toBe("01JQ8F3K2M9X7YB4NDVWZP6HRC");
  });

  it("keeps the validation issues from a 422", () => {
    const error = toApiError(response(422), {
      type: "about:blank",
      title: "Unprocessable Content",
      status: 422,
      errors: [{ field: "q", message: "Invalid length: Expected >=2 but received 1" }],
    });

    expect(error.errors).toEqual([
      { field: "q", message: "Invalid length: Expected >=2 but received 1" },
    ]);
  });

  it("carries retryAfter on a 429", () => {
    expect(
      toApiError(response(429), { title: "Too Many Requests", status: 429 }, 30).retryAfter,
    ).toBe(30);
  });

  it("synthesises an error when the body is not a problem document", () => {
    const error = toApiError(response(502, "Bad Gateway"), "<html>nginx</html>");

    expect(error.status).toBe(502);
    expect(error.title).toBe("Bad Gateway");
    expect(error.detail).toBeUndefined();
    expect(error.type).toBe("about:blank");
  });

  it("synthesises an error when there is no body at all", () => {
    const error = toApiError(response(500), null);

    expect(error.status).toBe(500);
    expect(error.title).toBe("Request failed");
  });

  it("prefers the response status over a mismatched body status", () => {
    // A proxy rewriting the status must not be able to make the app think a
    // failure was something else.
    expect(toApiError(response(503), { title: "Nope", status: 200 }).status).toBe(503);
  });

  it("produces a message useful in a log line", () => {
    expect(
      toApiError(response(404), { title: "Not Found", status: 404, detail: "No such game." })
        .message,
    ).toBe("404 Not Found: No such game.");
  });
});

describe("isApiError", () => {
  it("recognises an ApiError", () => {
    expect(isApiError(toApiError(response(404), null))).toBe(true);
  });

  it("rejects a plain Error", () => {
    expect(isApiError(new Error("boom"))).toBe(false);
  });

  it("rejects a non-error", () => {
    expect(isApiError("boom")).toBe(false);
  });
});

describe("ApiError", () => {
  it("is an Error, so it flows through TanStack Query unchanged", () => {
    expect(toApiError(response(404), null)).toBeInstanceOf(Error);
    expect(toApiError(response(404), null)).toBeInstanceOf(ApiError);
  });
});
