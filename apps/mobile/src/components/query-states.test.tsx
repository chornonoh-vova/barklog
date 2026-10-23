import { render, screen, userEvent } from "@testing-library/react-native";

import { ErrorState, LoadingState } from "@/components/query-states";
import { ApiError } from "@/lib/api/errors";

describe("LoadingState", () => {
  it("shows a spinner", async () => {
    await render(<LoadingState />);

    expect(screen.getByRole("progressbar")).toBeOnTheScreen();
  });
});

describe("ErrorState", () => {
  it("explains an unexpected failure", async () => {
    await render(<ErrorState error={new Error("boom")} onRetry={jest.fn()} />);

    expect(screen.getByText("Something went wrong")).toBeOnTheScreen();
    expect(screen.getByText("Please try again.")).toBeOnTheScreen();
  });

  it("says when the device is offline", async () => {
    const offline = new ApiError({ status: 0, type: "about:blank", title: "Network error" });
    await render(<ErrorState error={offline} onRetry={jest.fn()} />);

    expect(screen.getByText("You're offline")).toBeOnTheScreen();
  });

  it("retries on Try Again", async () => {
    const onRetry = jest.fn();
    await render(<ErrorState error={new Error("boom")} onRetry={onRetry} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Try Again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
