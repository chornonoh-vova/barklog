import { render, screen, userEvent } from "@testing-library/react-native";

import { StatusFilter } from "@/features/backlog/status-filter";
import { setWindow } from "@test/window";

describe("StatusFilter", () => {
  it("offers All and every status, with the current one selected", async () => {
    await render(<StatusFilter value="playing" onChange={jest.fn()} />);

    for (const name of ["All", "Waiting", "Playing", "Completed", "Abandoned"]) {
      expect(screen.getByRole("radio", { name })).toBeOnTheScreen();
    }
    expect(screen.getByRole("radio", { name: "Playing" })).toBeSelected();
    expect(screen.getByRole("radio", { name: "All" })).not.toBeSelected();
  });

  it("names only the selected segment; the rest are icons", async () => {
    await render(<StatusFilter value={undefined} onChange={jest.fn()} />);

    expect(screen.getByText("All")).toBeOnTheScreen();
    expect(screen.queryByText("Playing")).not.toBeOnTheScreen();
  });

  it("reports a status pick, and All as no filter", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await render(<StatusFilter value="waiting" onChange={onChange} />);

    await user.press(screen.getByRole("radio", { name: "Completed" }));
    await user.press(screen.getByRole("radio", { name: "All" }));

    expect(onChange.mock.calls).toEqual([["completed"], [undefined]]);
  });

  it("becomes a menu at accessibility text sizes, where five segments truncate", async () => {
    await setWindow({ fontScale: 2 });
    await render(<StatusFilter value="abandoned" onChange={jest.fn()} />);

    expect(screen.getByText("Show")).toBeOnTheScreen();
    expect(screen.getByRole("menu", { name: "Abandoned" })).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Abandoned" })).toBeSelected();
  });
});
