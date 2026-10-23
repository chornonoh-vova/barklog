import { screen, waitFor } from "@testing-library/react-native";

import { pushBacklog } from "@/features/widgets/sync";
import { WidgetSync } from "@/features/widgets/widget-sync";
import { backlogItem, backlogList } from "@test/fixtures";
import { fakeEndpoints, renderWithProviders } from "@test/render";

jest.mock("@/features/widgets/sync", () => ({ pushBacklog: jest.fn() }));

describe("WidgetSync", () => {
  it("draws nothing and pushes nothing until the backlog loads", async () => {
    const api = fakeEndpoints({ listBacklog: () => new Promise(() => {}) });
    await renderWithProviders(<WidgetSync />, { api });

    expect(screen.toJSON()).toBeNull();
    expect(pushBacklog).not.toHaveBeenCalled();
  });

  it("pushes the backlog once it loads, and again whenever it changes", async () => {
    const first = backlogList(backlogItem(1, "playing"));
    const second = backlogList(backlogItem(1, "completed"));
    const api = fakeEndpoints({ listBacklog: async () => first });
    const { queryClient } = await renderWithProviders(<WidgetSync />, { api });

    await waitFor(() => expect(pushBacklog).toHaveBeenCalledWith(first));

    api.listBacklog.mockResolvedValue(second);
    await queryClient.invalidateQueries();

    await waitFor(() => expect(pushBacklog).toHaveBeenLastCalledWith(second));
    expect(pushBacklog).toHaveBeenCalledTimes(2);
  });
});
