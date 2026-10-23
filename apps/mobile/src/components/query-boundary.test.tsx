import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";

import { QueryBoundary } from "@/components/query-boundary";
import { ApiError } from "@/lib/api/errors";

const query = (state: Partial<UseQueryResult<string>>) =>
  ({
    data: undefined,
    isPending: false,
    error: null,
    refetch: jest.fn(),
    ...state,
  }) as unknown as UseQueryResult<string>;

const renderBoundary = (result: UseQueryResult<string>, loading?: ReactNode) =>
  render(
    <QueryBoundary query={result} loading={loading}>
      {(data) => <Text>{data}</Text>}
    </QueryBoundary>,
  );

describe("QueryBoundary", () => {
  it("renders the data", async () => {
    await renderBoundary(query({ data: "Hades" }));

    expect(screen.getByText("Hades")).toBeOnTheScreen();
  });

  it("keeps showing data when a background refetch failed", async () => {
    await renderBoundary(query({ data: "Hades", isError: true, error: new Error("offline") }));

    expect(screen.getByText("Hades")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try Again" })).not.toBeOnTheScreen();
  });

  it("shows a spinner while the first load is pending", async () => {
    await renderBoundary(query({ isPending: true }));

    expect(screen.getByRole("progressbar")).toBeOnTheScreen();
  });

  it("shows the caller's own loading state when given one", async () => {
    await renderBoundary(query({ isPending: true }), <Text>Loading games</Text>);

    expect(screen.getByText("Loading games")).toBeOnTheScreen();
  });

  it("shows the error and retries on Try Again", async () => {
    const result = query({
      error: new ApiError({ status: 500, type: "about:blank", title: "Server error" }),
    });
    await renderBoundary(result);

    await userEvent.setup().press(screen.getByRole("button", { name: "Try Again" }));

    expect(result.refetch).toHaveBeenCalledTimes(1);
  });
});
