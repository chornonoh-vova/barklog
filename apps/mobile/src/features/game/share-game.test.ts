import { Share } from "react-native";

import { gameShareContent, shareGame } from "@/features/game/share-game";
import { gameUrl } from "@/lib/igdb/url";

describe("gameShareContent", () => {
  it("shares the game's igdb.com page URL", () => {
    const { content } = gameShareContent({ slug: "mortal-shell-ii", name: "Mortal Shell II" });

    expect(content.url).toBe(gameUrl("mortal-shell-ii"));
  });

  it("carries the name as the title Android reads", () => {
    const { content } = gameShareContent({
      slug: "hollow-knight-silksong",
      name: "Hollow Knight: Silksong",
    });

    expect(content.title).toBe("Hollow Knight: Silksong");
  });

  it("repeats the name as the iOS mail subject", () => {
    const { options } = gameShareContent({
      slug: "hollow-knight-silksong",
      name: "Hollow Knight: Silksong",
    });

    expect(options.subject).toBe("Hollow Knight: Silksong");
  });

  it("leaves punctuation in the name unescaped", () => {
    const { content, options } = gameShareContent({
      slug: "nier-automata",
      name: "NieR:Automata — Game of the YoRHa Edition",
    });

    expect(content.title).toBe("NieR:Automata — Game of the YoRHa Edition");
    expect(options.subject).toBe("NieR:Automata — Game of the YoRHa Edition");
  });
});

describe("shareGame", () => {
  afterEach(() => jest.restoreAllMocks());

  it("opens the share sheet with the game's content", () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const game = { slug: "hades-ii", name: "Hades II" };

    shareGame(game);

    const { content, options } = gameShareContent(game);
    expect(share).toHaveBeenCalledWith(content, options);
  });

  it("swallows a dismissed or failed share", async () => {
    jest.spyOn(Share, "share").mockRejectedValue(new Error("dismissed"));

    expect(() => shareGame({ slug: "hades-ii", name: "Hades II" })).not.toThrow();
    await Promise.resolve();
  });
});
