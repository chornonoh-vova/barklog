import { render, screen } from "@testing-library/react-native";

import { IgdbAttribution } from "@/features/game/igdb-attribution";

describe("IgdbAttribution", () => {
  it("credits IGDB with a link to the game's own IGDB page", async () => {
    await render(<IgdbAttribution slug="hades" />);

    const link = screen.getByRole("link", { name: "Powered by IGDB" });
    // The `@expo/ui` mock carries a link's destination as its hint.
    expect(link).toHaveProp("accessibilityHint", "https://www.igdb.com/games/hades");
  });
});
