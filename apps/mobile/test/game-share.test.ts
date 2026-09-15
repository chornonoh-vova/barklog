import { describe, expect, it } from "vitest";

import { gameShareContent } from "@/features/game/share";
import { gameUrl } from "@/igdb-url";

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
