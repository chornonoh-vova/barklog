import { renderHook } from "@testing-library/react-native";

import { useSharedUrl } from "@/features/share/use-shared-url";
import { share } from "@test/mocks/native";

const LINK = "https://www.youtube.com/watch?v=abc";

describe("useSharedUrl", () => {
  it("waits for nothing when the app was opened without a share", async () => {
    const { result } = await renderHook(() => useSharedUrl());

    expect(result.current).toMatchObject({ url: null, isPending: false, error: null });
  });

  it("waits on a share's first frame, before resolving has started", async () => {
    share.sharedPayloads = [{ contentType: "website" }];
    const { result } = await renderHook(() => useSharedUrl());

    expect(result.current.isPending).toBe(true);
  });

  it("waits while resolving, then hands over the link", async () => {
    share.sharedPayloads = [{ contentType: "website" }];
    share.isResolving = true;
    const { result, rerender } = await renderHook(() => useSharedUrl());
    expect(result.current.isPending).toBe(true);

    share.isResolving = false;
    share.resolvedSharedPayloads = [{ contentType: "website", contentUri: LINK }];
    await rerender({});

    expect(result.current).toMatchObject({ url: LINK, isPending: false });
  });

  it("finds a link inside shared text", async () => {
    share.sharedPayloads = [{ contentType: "text" }];
    share.resolvedSharedPayloads = [{ contentType: "text", value: `Watch this ${LINK}.` }];
    const { result } = await renderHook(() => useSharedUrl());

    expect(result.current).toMatchObject({ url: LINK, isPending: false });
  });

  it("stops waiting when resolving finishes with nothing to show", async () => {
    share.sharedPayloads = [{ contentType: "image" }];
    share.isResolving = true;
    const { result, rerender } = await renderHook(() => useSharedUrl());

    share.isResolving = false;
    await rerender({});

    expect(result.current).toMatchObject({ url: null, isPending: false });
  });

  it("stops waiting and reports a failed resolve", async () => {
    const error = new Error("unreadable");
    share.sharedPayloads = [{ contentType: "website" }];
    share.error = error;
    const { result } = await renderHook(() => useSharedUrl());

    expect(result.current).toMatchObject({ isPending: false, error });
  });

  it("clears the payload on request", async () => {
    const { result } = await renderHook(() => useSharedUrl());

    result.current.clear();

    expect(share.clearSharedPayloads).toHaveBeenCalledTimes(1);
  });
});
