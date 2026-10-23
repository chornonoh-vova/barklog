import { render as renderNative, screen, userEvent } from "@testing-library/react-native";

import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { RecentSearches } from "@/features/search/recent-searches";

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const render = (ui: ReactElement) =>
  renderNative(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);

describe("RecentSearches", () => {
  it("lists recent queries newest first under a Recent header", async () => {
    await render(
      <RecentSearches recents={["hades", "celeste"]} onPick={jest.fn()} onClear={jest.fn()} />,
    );

    expect(screen.getByRole("header", { name: "Recent" })).toBeOnTheScreen();
    const rows = screen.getAllByRole("button", { name: /^Search for / });
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      "Search for hades",
      "Search for celeste",
    ]);
  });

  it("searches again for a picked query", async () => {
    const onPick = jest.fn();
    await render(
      <RecentSearches recents={["hades", "celeste"]} onPick={onPick} onClear={jest.fn()} />,
    );

    await userEvent.setup().press(screen.getByRole("button", { name: "Search for celeste" }));

    expect(onPick).toHaveBeenCalledWith("celeste");
  });

  it("clears the list", async () => {
    const onClear = jest.fn();
    await render(<RecentSearches recents={["hades"]} onPick={jest.fn()} onClear={onClear} />);

    await userEvent.setup().press(screen.getByRole("button", { name: "Clear recent searches" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
