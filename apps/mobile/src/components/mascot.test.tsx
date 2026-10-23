import { render } from "@testing-library/react-native";

import { Mascot } from "@/components/mascot";
import { nativeView } from "@test/queries";

const image = () => nativeView("ViewManagerAdapter_ExpoImage");

describe("Mascot", () => {
  it("shows the named illustration, whole, at its fixed size", async () => {
    await render(<Mascot illustration="share" />);

    expect(image().props.source).toEqual([
      { testUri: expect.stringMatching(/barklog-mascot-share\.webp$/) },
    ]);
    expect(image().props.contentFit).toBe("contain");
    expect(image()).toHaveStyle({ width: 200, height: 200 });
  });

  it("lets touches through and stays out of VoiceOver, since the title says the same", async () => {
    await render(<Mascot illustration="backlog" />);

    expect(image().props.pointerEvents).toBe("none");
    expect(image().props.accessible).toBeFalsy();
  });
});
