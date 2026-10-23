import { render, screen } from "@testing-library/react-native";

import { Hero } from "@/features/game/hero";
import { gameDetail } from "@test/fixtures";
import { setWindow } from "@test/window";

describe("Hero", () => {
  it("shows the name, lead developer, year and genres, and rating", async () => {
    await render(
      <Hero
        game={gameDetail({
          name: "Hades",
          developers: [
            { id: 1, name: "Supergiant Games", slug: "supergiant" },
            { id: 2, name: "Other Studio", slug: "other" },
          ],
          totalRating: 92.6,
          totalRatingCount: 1500,
        })}
      />,
    );

    expect(screen.getByText("Hades")).toBeOnTheScreen();
    expect(screen.getByText("Supergiant Games")).toBeOnTheScreen();
    expect(screen.queryByText("Other Studio")).not.toBeOnTheScreen();
    expect(screen.getByText("2020 · Adventure")).toBeOnTheScreen();
    expect(screen.getByText("★ 93 · 1,500 ratings")).toBeOnTheScreen();
  });

  it("reads the rating out of 100 instead of the star glyph", async () => {
    await render(<Hero game={gameDetail({ totalRating: 85, totalRatingCount: 1 })} />);

    expect(screen.getByLabelText("Rated 85 out of 100, from 1 rating")).toBeOnTheScreen();
  });

  it("leaves out the lines IGDB has nothing for", async () => {
    await render(
      <Hero
        game={gameDetail({
          name: "Mystery",
          developers: [],
          firstReleaseDate: null,
          genres: [],
          totalRating: null,
        })}
      />,
    );

    expect(screen.getByText("Mystery")).toBeOnTheScreen();
    expect(screen.queryByText("Studio")).not.toBeOnTheScreen();
    expect(screen.queryByText(/2020/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/★/)).not.toBeOnTheScreen();
  });

  it("puts the cover above the text at accessibility sizes", async () => {
    await setWindow({ fontScale: 2 });
    await render(<Hero game={gameDetail({ name: "Hades" })} />);

    const name = screen.getByText("Hades");
    // Name → info column → the cover-and-info row.
    expect(name.parent?.parent).toHaveStyle({ flexDirection: "column" });
  });
});
