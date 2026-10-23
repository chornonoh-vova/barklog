import { renderHook } from "@testing-library/react-native";

import { ApiProvider, useApi } from "@/lib/api/provider";
import { me } from "@test/fixtures";
import { clerk } from "@test/mocks/native";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useApi", () => {
  it("throws outside an ApiProvider", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(renderHook(() => useApi())).rejects.toThrow(
      "useApi must be used inside <ApiProvider>",
    );
  });
});

describe("ApiProvider", () => {
  it("builds endpoints that call the API with the Clerk session token", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json(me({ premium: true })));
    const { result } = await renderHook(() => useApi(), { wrapper: ApiProvider });

    await expect(result.current.getMe()).resolves.toEqual(me({ premium: true }));

    expect(clerk.getToken).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.barklog.test/api/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer tok_test" }),
      }),
    );
  });

  it("keeps the same endpoints across re-renders", async () => {
    const { result, rerender } = await renderHook(() => useApi(), { wrapper: ApiProvider });
    const first = result.current;

    await rerender({});

    expect(result.current).toBe(first);
  });
});
