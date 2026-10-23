import { render } from "@testing-library/react-native";

import { RemoteImage } from "@/components/remote-image";
import { useImageTransition } from "@/ui/use-reduced-motion";
import { nativeView } from "@test/queries";

jest.mock("@/ui/use-reduced-motion", () => ({ useImageTransition: jest.fn(() => 150) }));

const image = () => nativeView("ViewManagerAdapter_ExpoImage");

const uri = "https://example.com/cover.jpg";

describe("RemoteImage", () => {
  it("cross-fades a cover that fills its frame and caches it on disk", async () => {
    await render(<RemoteImage source={{ uri }} />);

    expect(image().props).toEqual(
      expect.objectContaining({
        contentFit: "cover",
        cachePolicy: "disk",
        transition: { duration: 150 },
      }),
    );
  });

  it("lets a caller change the fit", async () => {
    await render(<RemoteImage source={{ uri }} contentFit="contain" />);

    expect(image().props.contentFit).toBe("contain");
  });

  it("does not let a caller bring back the fade when Reduce Motion is on", async () => {
    jest.mocked(useImageTransition).mockReturnValue(0);
    await render(<RemoteImage source={{ uri }} transition={1000} />);

    expect(image().props.transition).toEqual({ duration: 0 });
  });
});
