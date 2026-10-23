import { ILLUSTRATIONS, type IllustrationName } from "@/components/illustrations";

describe("ILLUSTRATIONS", () => {
  it("has its own mascot art for every illustration name", () => {
    const names: IllustrationName[] = ["default", "backlog", "explore", "share"];

    expect(Object.keys(ILLUSTRATIONS).sort()).toEqual([...names].sort());
    for (const name of names) {
      expect(ILLUSTRATIONS[name]).toEqual({
        testUri: expect.stringMatching(new RegExp(`barklog-mascot-${name}\\.webp$`)),
      });
    }
  });
});
