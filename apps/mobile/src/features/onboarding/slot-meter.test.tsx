import { FREE_ACTIVE_SLOTS } from "@repo/contracts";
import { render, screen } from "@testing-library/react-native";

import { SlotMeter } from "@/features/onboarding/slot-meter";

const hidden = { includeHiddenElements: true } as const;

describe("SlotMeter", () => {
  it("draws one segment per free-tier slot, four of them filled", async () => {
    await render(<SlotMeter />);

    expect(screen.getAllByTestId(/^slot-(filled|empty)$/, hidden)).toHaveLength(FREE_ACTIVE_SLOTS);
    expect(screen.getAllByTestId("slot-filled", hidden)).toHaveLength(4);
  });

  it("is decoration only, hidden from VoiceOver", async () => {
    await render(<SlotMeter />);

    expect(screen.getByTestId("slot-meter", hidden)).toHaveProp(
      "accessibilityElementsHidden",
      true,
    );
  });
});
