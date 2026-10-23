import { render, screen } from "@testing-library/react-native";

import { DetailRows } from "@/features/game/detail-rows";
import { gameDetail } from "@test/fixtures";

describe("DetailRows", () => {
  it("lists the game's facts, platforms by abbreviation", async () => {
    await render(
      <DetailRows
        game={gameDetail({
          gameType: { id: 0, name: "Main Game" },
          genres: [
            { id: 1, name: "Adventure", slug: "adventure" },
            { id: 2, name: "Indie", slug: "indie" },
          ],
          platforms: [
            { id: 1, name: "PlayStation 5", slug: "ps5", abbreviation: "PS5" },
            { id: 2, name: "Nintendo Switch", slug: "switch", abbreviation: null },
          ],
        })}
      />,
    );

    const facts: [string, string][] = [
      ["Release", "1 March 2020"],
      ["Type", "Main Game"],
      ["Genres", "Adventure, Indie"],
      ["Platforms", "PS5, Nintendo Switch"],
      ["Developers", "Studio"],
      ["Publishers", "Publisher"],
    ];
    for (const [label, value] of facts) {
      expect(screen.getByText(label)).toBeOnTheScreen();
      expect(screen.getByText(value)).toBeOnTheScreen();
    }
  });

  it("leaves out what IGDB does not know, but says when the date is unknown", async () => {
    await render(
      <DetailRows
        game={gameDetail({
          firstReleaseDate: null,
          gameType: null,
          genres: [],
          platforms: [],
          developers: [],
          publishers: [],
        })}
      />,
    );

    expect(screen.getByText("Release")).toBeOnTheScreen();
    expect(screen.getByText("Unknown")).toBeOnTheScreen();
    for (const label of ["Type", "Genres", "Platforms", "Developers", "Publishers"]) {
      expect(screen.queryByText(label)).not.toBeOnTheScreen();
    }
  });
});
