import { showUpdatingPill } from "@/features/backlog/loading-state";

describe("showUpdatingPill", () => {
  it("shows while cached data revalidates in the background", () => {
    expect(showUpdatingPill({ hasData: true, isFetching: true, userRefreshing: false })).toBe(true);
  });

  // A pull already has the native spinner; two indicators for one refresh is noise.
  it("hides during a user pull-to-refresh", () => {
    expect(showUpdatingPill({ hasData: true, isFetching: true, userRefreshing: true })).toBe(false);
  });

  // The very first launch has nothing to show yet, so the full-screen loading stays.
  it("hides when there is no data yet", () => {
    expect(showUpdatingPill({ hasData: false, isFetching: true, userRefreshing: false })).toBe(
      false,
    );
  });

  it("hides when nothing is fetching", () => {
    expect(showUpdatingPill({ hasData: true, isFetching: false, userRefreshing: false })).toBe(
      false,
    );
  });
});
