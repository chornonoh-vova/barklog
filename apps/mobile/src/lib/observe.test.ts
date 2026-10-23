import { Observe } from "expo-observe";

const updates: { channel: string | null } = { channel: null };

jest.mock("expo-updates", () => ({
  get channel() {
    return updates.channel;
  },
}));

function load(): void {
  jest.isolateModules(() => {
    jest.requireActual("@/lib/observe");
  });
}

describe("observe", () => {
  beforeEach(() => {
    updates.channel = null;
  });

  it("switches on the router and image integrations on import", () => {
    load();

    expect(Observe.configure).toHaveBeenCalledTimes(1);
    expect(Observe.configure).toHaveBeenCalledWith({
      integrations: { "expo-router": true, "expo-image": true },
    });
  });

  it("reports a release build's channel as its environment", () => {
    updates.channel = "production";
    load();

    expect(Observe.configure).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "production" }),
    );
  });
});
