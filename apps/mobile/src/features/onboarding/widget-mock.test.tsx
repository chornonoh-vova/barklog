import { render, screen } from "@testing-library/react-native";

import { ONBOARDING_COVERS } from "@/features/onboarding/covers";
import { WidgetMock } from "@/features/onboarding/widget-mock";
import { statusSymbol } from "@/features/game/format";
import { nativeViews } from "@test/queries";

/** The mock is hidden from VoiceOver, so its text is only reachable this way. */
const hidden = { includeHiddenElements: true } as const;

describe("WidgetMock", () => {
  it("heads both widgets like the real one: the Playing symbol and an uppercase title", async () => {
    await render(<WidgetMock covers={ONBOARDING_COVERS} />);

    expect(screen.getAllByText("PLAYING", hidden)).toHaveLength(2);
    const symbols = nativeViews("ViewManagerAdapter_SymbolModule").map((view) => view.props.name);
    expect(symbols.filter((name) => name === statusSymbol("playing"))).toHaveLength(2);
  });

  it("names the small widget's game and the medium widget's four", async () => {
    await render(<WidgetMock covers={ONBOARDING_COVERS} />);

    // The first game is on both widgets.
    expect(screen.getAllByText("Grand Theft Auto VI", hidden)).toHaveLength(2);
    for (const cover of ONBOARDING_COVERS.slice(1, 4)) {
      expect(screen.getByText(cover.name, hidden)).toBeOnTheScreen();
    }
    for (const cover of ONBOARDING_COVERS.slice(4)) {
      expect(screen.queryByText(cover.name, hidden)).not.toBeOnTheScreen();
    }
  });

  it("is decoration only, hidden from VoiceOver", async () => {
    await render(<WidgetMock covers={ONBOARDING_COVERS} />);

    expect(screen.root).toHaveProp("accessibilityElementsHidden", true);
    expect(screen.root).toHaveProp("importantForAccessibility", "no-hide-descendants");
  });
});
